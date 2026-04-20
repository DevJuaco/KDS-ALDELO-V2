import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Hook para gestionar las órdenes del KDS mediante WebSockets y REST API.
 * Mapea el modelo de datos "Moderno" del backend al modelo "Clásico" que usa la UI.
 */
function playNotificationSound() {
  try {
    const settings = localStorage.getItem('kds-display-settings');
    const soundEnabled = settings ? JSON.parse(settings).soundAlert !== false : true;
    if (!soundEnabled) return;
    const audio = new Audio('/notification-sound.mp3');
    audio.volume = 0.3;
    audio.play().catch(() => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 800; osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
      } catch {}
    });
  } catch {}
}

export const useOrders = (url = `ws://${window.location.hostname}:5001/ws/orders`) => {
  const [ordersMap, setOrdersMap] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef();
  const isInitRef = useRef(true);

  // Mapeo de datos Moderno -> Clásico (Aldelo compatible)
  const mapOrder = useCallback((data) => {
    const items = (data.items || []).slice().sort((a, b) => a.item_id - b.item_id);
    return {
      orderheaders: {
        OrderID: data.order_id,
        EmployeeName: data.employee_name || '',
        OrderDateTime: data.order_date || new Date().toISOString(),
        OrderStatus: data.status === 'READY' ? 3 : 1,
        OrderType: String(data.order_type || '1'),
        CustomerName: data.customer_name || '',
        Turn: data.order_id,
        DineInTableText: data.dine_in_table_text || '',
        SpecificCustomerName: data.specific_customer_name || '',
      },
      ordertransactions: items.map((item) => ({
        OrderTransactionID: item.item_id,
        MenuItemText: item.name,
        Quantity: item.quantity,
        MenuItemUnitPrice: item.price,
        ExtendedPrice: item.price * item.quantity,
        MenuItemNotification: item.notification || '5',
        TransactionStatus: item.transaction_status || '1',
        Status: item.status === 'READY' ? 'FINISHED' : 'PREPARING',
        ShortNote: item.short_note || '',
        modifiers: item.modifiers || [],
      })),
    };
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
        setLoading(false);
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        console.log("KDS WebSocket connected");
      };

      socket.onmessage = (event) => {
        try {
          const { type, data } = JSON.parse(event.data);
          console.log(`WS Event: ${type}`, data);

          setOrdersMap((prev) => {
            switch (type) {
              case "init":
                isInitRef.current = false;
                return (data || []).reduce((acc, rawOrder) => {
                  const order = mapOrder(rawOrder);
                  acc[order.orderheaders.OrderID] = order;
                  return acc;
                }, {});

              case "order_created": {
                const mappedOrder = mapOrder(data);
                if (!isInitRef.current) playNotificationSound();
                return { ...prev, [mappedOrder.orderheaders.OrderID]: mappedOrder };
              }
              case "order_updated": {
                const mappedOrder = mapOrder(data);
                return { ...prev, [mappedOrder.orderheaders.OrderID]: mappedOrder };
              }

              case "order_deleted":
                const idToDelete = data.order_id || data.OrderID;
                const newState = { ...prev };
                delete newState[idToDelete];
                return newState;

              default:
                return prev;
            }
          });
        } catch (err) {
          console.error("WS Message Parse Error:", err);
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        console.log("KDS WebSocket disconnected, retrying in 3s...");
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      socket.onerror = (err) => {
        console.error("WS Socket Error:", err);
        socket.close();
      };
    } catch (err) {
      console.error("WS Connection Error:", err);
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, [url, mapOrder]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  // Acciones REST
  const sendOrderStatusUpdate = async (orderId, status) => {
    try {
      const response = await fetch(`http://${window.location.hostname}:5001/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (err) {
      console.error("API Update Error:", err);
      return { error: err.message };
    }
  };

  const sendItemStatusUpdate = async (orderId, itemId, status) => {
    try {
      const response = await fetch(`http://${window.location.hostname}:5001/orders/${orderId}/items/${itemId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (err) {
      console.error("API Item Update Error:", err);
      return { error: err.message };
    }
  };

  const toggleItemStatus = useCallback(async (orderId, transId, currentStatus) => {
    const nextStatus = currentStatus === 'PREPARING' ? 'READY' : 'CREATED';
    await sendItemStatusUpdate(orderId, transId, nextStatus);
  }, []);

  const servirTodo = useCallback(async (order) => {
    return await sendOrderStatusUpdate(order.orderheaders.OrderID, 'READY');
  }, []);

  const reabrirTodo = useCallback(async (order) => {
    return await sendOrderStatusUpdate(order.orderheaders.OrderID, 'CREATED');
  }, []);

  const getTransactionModifiers = useCallback((t) => t.modifiers || [], []);

  return {
    orders: Object.values(ordersMap),
    loading,
    isConnected,
    refreshOrders: connect,
    toggleItemStatus,
    servirTodo,
    reabrirTodo,
    getTransactionModifiers,
  };
};
