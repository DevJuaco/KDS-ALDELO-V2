import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, ChefHat, Home, Utensils, Car, AlertTriangle } from 'lucide-react';
import { formatOrderTime, calculateElapsedTime, getTimeColor } from '../utils/timeUtils';
import OrderItem from './OrderItem';
import { useOrderTypes } from '../hooks/useOrderTypes';

export default function OrderCard({
  order,
  currentTime,
  activeTab,
  getTransactionModifiers,
  onToggleItem,
  onServirTodo,
  onReabrirTodo,
  isSelected = false,
  selectedItemIndex = -1,
  onDoubleClick,
  spanRows = 1,
  displayTransactions,
  isContinuation = false,
  hasContinuation = false,
  className,
}) {
  const { orderTypes } = useOrderTypes();
  const [showCancelAlert, setShowCancelAlert] = useState(false);
  const [canceledItems, setCanceledItems] = useState([]);
  const [newCanceledItems, setNewCanceledItems] = useState([]);
  const [showServeButton, setShowServeButton] = useState(true);
  const [showEmployeeName, setShowEmployeeName] = useState(true);
  const [showOrderIdInHeader, setShowOrderIdInHeader] = useState(false);
  const [showElapsedTimeInHeader, setShowElapsedTimeInHeader] = useState(false);

  const shownAlertsRef = useRef(new Set());
  const itemsContainerRef = useRef(null);
  const itemRefs = useRef({});

  // Función para hacer scroll al item seleccionado dentro de esta OrderCard
  const scrollToSelectedItem = useCallback(() => {
    if (!isSelected || selectedItemIndex === -1 || !itemsContainerRef.current) return;

    const itemElement = itemRefs.current[selectedItemIndex];

    if (itemElement && itemsContainerRef.current) {
      // Calcular la posición relativa dentro del contenedor
      const container = itemsContainerRef.current;
      const itemRect = itemElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Calcular si el item está fuera de la vista
      const isAboveView = itemRect.top < containerRect.top;
      const isBelowView = itemRect.bottom > containerRect.bottom;

      if (isAboveView || isBelowView) {
        // Hacer scroll suave para centrar el item
        itemElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }, [isSelected, selectedItemIndex]);

  // Efecto para hacer scroll cuando cambia el item seleccionado
  useEffect(() => {
    if (isSelected) {
      const timeoutId = setTimeout(() => {
        scrollToSelectedItem();
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [selectedItemIndex, isSelected, scrollToSelectedItem]);

  // Función para registrar referencia de un item
  const registerItemRef = useCallback((index, element) => {
    itemRefs.current[index] = element;
  }, []);

  // Leer configuración de visualización del botón desde localStorage
  useEffect(() => {
    const settings = localStorage.getItem('kds-display-settings');
    if (settings) {
      try {
        const parsed = JSON.parse(settings);
        setShowServeButton(parsed.showServeButton !== undefined ? parsed.showServeButton : true);
        setShowEmployeeName(parsed.showEmployeeName !== undefined ? parsed.showEmployeeName : true);
        setShowOrderIdInHeader(parsed.showOrderIdInHeader !== undefined ? parsed.showOrderIdInHeader : false);
        setShowElapsedTimeInHeader(parsed.showElapsedTimeInHeader !== undefined ? parsed.showElapsedTimeInHeader : false);
      } catch (error) {
        console.log('Error al leer configuración de visualización:', error);
      }
    }
  }, []);

  // ========== SISTEMA PARA CANCELACIONES (por TransactionID) ==========

  // Función para obtener transacciones notificadas del localStorage
  const getNotifiedTransactions = useCallback(() => {
    try {
      const notified = localStorage.getItem('kds-notified-transactions');
      return notified ? JSON.parse(notified) : { canceled: [] };
    } catch {
      return { canceled: [] };
    }
  }, []);

  // Función para guardar transacción notificada en localStorage
  const saveNotifiedTransaction = useCallback((transactionId) => {
    try {
      const notified = getNotifiedTransactions();
      if (!notified.canceled.includes(transactionId)) {
        notified.canceled.push(transactionId);
        localStorage.setItem('kds-notified-transactions', JSON.stringify(notified));
      }
    } catch (error) {
      console.log('Error guardando transacción notificada:', error);
    }
  }, [getNotifiedTransactions]);

  // Función para verificar si una transacción ya fue notificada
  const isTransactionNotified = useCallback((transactionId) => {
    const notified = getNotifiedTransactions();
    return notified.canceled.includes(transactionId);
  }, [getNotifiedTransactions]);

  // Función para limpiar notificaciones de transacciones antiguas
  const cleanupTransactionNotifications = useCallback(() => {
    try {
      const notified = getNotifiedTransactions();

      // Limitar el tamaño del array para evitar que crezca demasiado
      if (notified.canceled.length > 1000) {
        notified.canceled = notified.canceled.slice(-500);
      }

      localStorage.setItem('kds-notified-transactions', JSON.stringify(notified));
    } catch (error) {
      console.log('Error limpiando notificaciones de transacciones:', error);
    }
  }, [getNotifiedTransactions]);

  // ========== SISTEMA PARA ALERTDELAY (por OrderID) ==========

  // Función para obtener órdenes notificadas del localStorage
  const getNotifiedOrders = useCallback(() => {
    try {
      const notified = localStorage.getItem('kds-notified-orders');
      return notified ? JSON.parse(notified) : { overdue: [] };
    } catch {
      return { overdue: [] };
    }
  }, []);

  // Función para guardar orden notificada en localStorage
  const saveNotifiedOrder = useCallback((orderId) => {
    try {
      const notified = getNotifiedOrders();
      if (!notified.overdue.includes(orderId)) {
        notified.overdue.push(orderId);
        localStorage.setItem('kds-notified-orders', JSON.stringify(notified));
      }
    } catch (error) {
      console.log('Error guardando orden notificada:', error);
    }
  }, [getNotifiedOrders]);

  // Función para verificar si una orden ya fue notificada por tiempo excedido
  const isOrderNotified = useCallback((orderId) => {
    const notified = getNotifiedOrders();
    return notified.overdue.includes(orderId);
  }, [getNotifiedOrders]);

  // Función para limpiar notificaciones de órdenes antiguas
  const cleanupOrderNotifications = useCallback(() => {
    try {
      const notified = getNotifiedOrders();

      // Limitar el tamaño del array para evitar que crezca demasiado
      if (notified.overdue.length > 500) {
        notified.overdue = notified.overdue.slice(-250);
      }

      localStorage.setItem('kds-notified-orders', JSON.stringify(notified));
    } catch (error) {
      console.log('Error limpiando notificaciones de órdenes:', error);
    }
  }, [getNotifiedOrders]);

  // ========== FUNCIONES DE SONIDO ==========

  // Función para reproducir sonido de cancelación
  const playCancelSound = useCallback(() => {
    try {
      const settings = localStorage.getItem('kds-display-settings');
      const soundEnabled = settings ? JSON.parse(settings).soundAlert : true;

      if (soundEnabled) {
        const audio = new Audio('/cancel-sound.mp3');
        audio.volume = 0.4;
        audio.play().catch(error => {
          console.log('Error reproduciendo sonido de cancelación:', error);
          playFallbackCancelSound();
        });
      }
    } catch (error) {
      console.log('Error en playCancelSound:', error);
      playFallbackCancelSound();
    }
  }, []);

  // Función de respaldo para sonido de cancelación
  const playFallbackCancelSound = useCallback(() => {
    try {
      const settings = localStorage.getItem('kds-display-settings');
      const soundEnabled = settings ? JSON.parse(settings).soundAlert : true;

      if (soundEnabled && window.AudioContext) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 400;
        oscillator.type = 'sawtooth';

        gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.8);
      }
    } catch (error) {
      console.log('Error en playFallbackCancelSound:', error);
    }
  }, []);

  // Función para reproducir sonido de tiempo excedido
  const playOverdueSound = useCallback(() => {
    try {
      const settings = localStorage.getItem('kds-display-settings');
      const soundEnabled = settings ? JSON.parse(settings).soundAlert : true;

      if (soundEnabled) {
        const audio = new Audio('/alert-sound.mp3');
        audio.volume = 0.5;
        audio.play().catch(error => {
          console.log('Error reproduciendo sonido de alerta:', error);
          playFallbackOverdueSound();
        });
      }
    } catch (error) {
      console.log('Error en playOverdueSound:', error);
      playFallbackOverdueSound();
    }
  }, []);

  // Función de respaldo para sonido de tiempo excedido
  const playFallbackOverdueSound = useCallback(() => {
    try {
      const settings = localStorage.getItem('kds-display-settings');
      const soundEnabled = settings ? JSON.parse(settings).soundAlert : true;

      if (soundEnabled && window.AudioContext) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 600 + (i * 100);
            oscillator.type = 'square';

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
          }, i * 400);
        }
      }
    } catch (error) {
      console.log('Error en playFallbackOverdueSound:', error);
    }
  }, []);

  // ========== EFECTOS PRINCIPALES ==========

  // Detectar cancelaciones - POR TRANSACTION ID
  useEffect(() => {
    if (!order || !order.orderheaders || !order.ordertransactions) return;

    const canceledTransactions = order.ordertransactions
      .filter((t) => t.TransactionStatus === '2')
      .map((t) => ({
        name: t.MenuItemText,
        qty: t.Quantity,
        transactionId: t.OrderTransactionID
      }));

    // Filtrar solo las transacciones canceladas que NO han sido notificadas
    const newCanceled = canceledTransactions.filter(
      (item) => !isTransactionNotified(item.transactionId)
    );

    if (newCanceled.length > 0) {
      // Actualizar el estado con TODAS las cancelaciones (para mostrar en el modal)
      setCanceledItems(canceledTransactions);

      // Guardar solo las NUEVAS cancelaciones para mostrar en el alerta
      setNewCanceledItems(newCanceled);

      // Mostrar alerta y reproducir sonido para las NUEVAS cancelaciones
      setShowCancelAlert(true);

      // Marcar cada nueva transacción como notificada
      newCanceled.forEach(item => {
        saveNotifiedTransaction(item.transactionId);
      });

      // Reproducir sonido de cancelación
      playCancelSound();
    }
  }, [order, playCancelSound, isTransactionNotified, saveNotifiedTransaction]);

  // Detectar tiempo excedido - POR ORDER ID
  useEffect(() => {
    if (!order || !order.orderheaders || activeTab !== 'PREPARING') return;

    const hasUnpreparedItems = order.ordertransactions.some((t) => t.Status === 'PREPARING');

    if (hasUnpreparedItems) {
      const elapsedTimeString = calculateElapsedTime(order.orderheaders.OrderDateTime);
      const hoursMatch = elapsedTimeString.match(/(\d+)h/);
      const minutesMatch = elapsedTimeString.match(/(\d+)m/);
      const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
      const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
      const totalMinutes = (hours * 60) + minutes;

      const timeSettings = JSON.parse(localStorage.getItem('kds-time-settings') || '{}');

      // Obtener alertDelay según el tipo de orden
      const orderType = order.orderheaders.OrderType;
      let alertdelay = 30;
      switch (orderType) {
        case '1': alertdelay = parseInt(timeSettings.alertDelayDineIn ?? timeSettings.alertDelay ?? '30'); break;
        case '2': alertdelay = parseInt(timeSettings.alertDelayTakeOut ?? timeSettings.alertDelay ?? '30'); break;
        case '3': alertdelay = parseInt(timeSettings.alertDelayDelivery ?? timeSettings.alertDelay ?? '30'); break;
        case '4': alertdelay = parseInt(timeSettings.alertDelayDriveThru ?? timeSettings.alertDelay ?? '30'); break;
        default: alertdelay = parseInt(timeSettings.alertDelayDineIn ?? timeSettings.alertDelay ?? '30');
      }

      const isOverdue = totalMinutes > alertdelay;
      const orderId = order.orderheaders.OrderID;

      if (isOverdue && !isOrderNotified(orderId)) {
        // Reproducir sonido de tiempo excedido
        playOverdueSound();
        saveNotifiedOrder(orderId);
      }
    }
  }, [order, currentTime, activeTab, playOverdueSound, isOrderNotified, saveNotifiedOrder]);

  // Limpiar notificaciones antiguas al montar el componente
  useEffect(() => {
    cleanupTransactionNotifications();
    cleanupOrderNotifications();
  }, [cleanupTransactionNotifications, cleanupOrderNotifications]);

  // ========== RENDER ==========

  const getOrderTypeInfo = (orderType) => {
    const typeMapping = {
      '1': { tipo: orderTypes?.DineInAliase || 'Mesas', cliente: order.orderheaders.DineInTableText, color: 'bg-blue-800', icon: <ChefHat className="w-5 h-5" /> },
      '2': { tipo: orderTypes?.TakeOutAliase || 'Para Llevar', cliente: order.orderheaders.CustomerName, color: 'bg-purple-700', icon: <Home className="w-5 h-5" /> },
      '3': { tipo: orderTypes?.DriveThruAliase || 'Rappi', cliente: order.orderheaders.CustomerName, color: 'bg-orange-500', icon: <Utensils className="w-5 h-5" /> },
      '4': { tipo: orderTypes?.DeliveryAliase || 'Domicilio', cliente: order.orderheaders.CustomerName, color: 'bg-green-500', icon: <Car className="w-5 h-5" /> },
    };
    return typeMapping[orderType] || typeMapping['1'];
  };

  const orderType = order.orderheaders.OrderType;
  const typeInfo = getOrderTypeInfo(orderType);
  const elapsedTimeString = calculateElapsedTime(order.orderheaders.OrderDateTime);

  const hasUnpreparedItems = order.ordertransactions.some((t) => t.Status === 'PREPARING');
  const isOverdue = hasUnpreparedItems && (() => {
    const hoursMatch = elapsedTimeString.match(/(\d+)h/);
    const minutesMatch = elapsedTimeString.match(/(\d+)m/);
    const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
    const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
    const totalMinutes = (hours * 60) + minutes;
    const timeSettings = JSON.parse(localStorage.getItem('kds-time-settings') || '{}');

    // Obtener alertDelay según el tipo de orden
    let alertdelay = 30;
    switch (orderType) {
      case '1': alertdelay = parseInt(timeSettings.alertDelayDineIn ?? timeSettings.alertDelay ?? '30'); break;
      case '2': alertdelay = parseInt(timeSettings.alertDelayTakeOut ?? timeSettings.alertDelay ?? '30'); break;
      case '3': alertdelay = parseInt(timeSettings.alertDelayDelivery ?? timeSettings.alertDelay ?? '30'); break;
      case '4': alertdelay = parseInt(timeSettings.alertDelayDriveThru ?? timeSettings.alertDelay ?? '30'); break;
      default: alertdelay = parseInt(timeSettings.alertDelayDineIn ?? timeSettings.alertDelay ?? '30');
    }
    return totalMinutes > alertdelay;
  })();

  // Transacciones a mostrar (subset si es virtual card, o todas si no)
  const transactionsToRender = displayTransactions || order.ordertransactions;

  return (
    <div
      className={`relative bg-white text-black font-bold rounded-lg overflow-hidden shadow-lg flex flex-col transition-all ${isSelected ? 'ring-4 ring-blue-500' : ''
        } ${className || ''}`}
      style={{ breakInside: 'avoid' }}
    >

      {/* CABECERA - Normal o Continuación */}
      {isContinuation ? (
        <div
          className={`text-white px-3 py-2 flex items-center justify-between ${isOverdue ? 'blink-red' : typeInfo.color}`}
          onDoubleClick={onDoubleClick}
        >
          <span className="font-bold text-base">Continued...</span>
          <div className="flex items-center gap-2">
            {typeInfo.icon}
          </div>
        </div>
      ) : (
        <div
          className={`text-white px-3 flex items-center justify-between ${isOverdue ? 'blink-red' : typeInfo.color
            }`}
          onDoubleClick={onDoubleClick}
        >
          <div className="flex items-center gap-2">
            {typeInfo.icon}
            <span className="font-bold text-base bg-white text-black px-2 py-1 rounded-lg inline-block">
              #{showOrderIdInHeader ? order.orderheaders.OrderID : order.orderheaders.Turn}
            </span>
          </div>
          <div className="text-right">
            <div className="font-bold text-base">
              {typeInfo.tipo} {typeInfo.cliente} - {showElapsedTimeInHeader ? calculateElapsedTime(order.orderheaders.OrderDateTime) : formatOrderTime(order.orderheaders.OrderDateTime)}
            </div>
          </div>
        </div>
      )}

      {/* TIEMPO - Solo si NO es continuación y NO está en cabecera */}
      {!isContinuation && !showElapsedTimeInHeader && (
        <div className="bg-gray-100 px-3 flex items-center justify-between border-b border-gray-300">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-600" />
            <span className="text-lg text-gray-600">Tiempo:</span>
          </div>
          <span className={`text-lg font-bold ${getTimeColor(order.orderheaders.OrderDateTime, currentTime, order.orderheaders.OrderType)}`}>
            {calculateElapsedTime(order.orderheaders.OrderDateTime)}
          </span>
        </div>
      )}

      {/* LISTA DE ITEMS */}
      <div
        ref={itemsContainerRef}
        className={`flex-1 overflow-hidden bg-gray-50 min-h-0 custom-scrollbar ${!hasContinuation ? 'pb-4' : ''}`}
      >
        {transactionsToRender.map((t, idx) => (
          <div
            key={t.OrderTransactionID}
            ref={(el) => registerItemRef(idx, el)}
          >
            <OrderItem
              trans={t}
              itemName={t.MenuItemText}
              modifiers={getTransactionModifiers(t)}
              onToggle={() => onToggleItem(order.orderheaders.OrderID, t.OrderTransactionID, t.Status || 'PREPARING')}
              isHighlighted={isSelected && idx === selectedItemIndex}
            />
          </div>
        ))}
      </div>

      {/* INDICADOR DE CONTINUACIÓN - Más sutil */}
      {hasContinuation && (
        <div className="bg-gray-100 py-1 text-center font-medium text-gray-500 text-xs border-t border-gray-200">
          Continued... ↓
        </div>
      )}

      {/* PIE - Solo si es la última parte o la única */}
      {!hasContinuation && (
        <div className="bg-white border-t border-gray-200">
          <div className="text-center text-xl">
            {order.orderheaders.SpecificCustomerName && /^\d+$/.test(order.orderheaders.SpecificCustomerName) && (
              <div className="font-bold text-2xl text-dark-700">
                {order.orderheaders.SpecificCustomerName}
              </div>
            )}
            {!showOrderIdInHeader && (
              <div className="font-bold text-2xl text-dark-700">
                # {order.orderheaders.OrderID}
              </div>
            )}
            {showEmployeeName && (
              <div className="font-bold text-lg text-black">
                {order.orderheaders.EmployeeName}
              </div>
            )}
          </div>
          {showServeButton && (
            activeTab === 'PREPARING' ? (
              <button
                onClick={() => onServirTodo(order)}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-1 rounded-lg text-sm"
              >
                SERVIR TODO
              </button>
            ) : (
              <button
                onClick={() => onReabrirTodo(order)}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-1 rounded-lg text-sm"
              >
                REABRIR TODO
              </button>
            )
          )}
        </div>
      )}

      {/* ⚠️ MODAL DE ALERTA DE CANCELACIÓN - MEJORADO */}
      {showCancelAlert && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <div className="flex flex-col items-center gap-3">
              <AlertTriangle className="text-red-600 w-10 h-10" />
              <h2 className="text-lg font-bold text-red-600">
                {newCanceledItems.length === 1 ? 'Ítem Cancelado' : 'Ítems Cancelados'}
              </h2>

              {newCanceledItems.length > 0 && (
                <>
                  <p className="text-gray-700 text-sm">
                    {newCanceledItems.length === 1
                      ? 'Se ha cancelado el siguiente ítem:'
                      : 'Se han cancelado los siguientes ítems:'}
                  </p>

                  <ul className="text-sm text-gray-800 font-semibold text-left mt-2 space-y-1 w-full">
                    {newCanceledItems.map((item, i) => (
                      <li key={i} className="flex justify-between bg-red-50 px-3 py-1 rounded">
                        <span>{item.qty} × {item.name}</span>
                        <span className="text-red-600 text-xs font-bold">CANCELADO</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {canceledItems.length > newCanceledItems.length && (
                <div className="mt-2 text-xs text-gray-600">
                  + {canceledItems.length - newCanceledItems.length} ítem(s) cancelado(s) previamente
                </div>
              )}

              <button
                onClick={() => setShowCancelAlert(false)}
                className="mt-5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
