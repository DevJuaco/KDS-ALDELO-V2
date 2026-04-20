// components/ExpandedOrder.tsx
import { X, Clock, ChefHat, Home, Utensils, Car, ArrowLeft } from 'lucide-react';
import { formatOrderTime, calculateElapsedTime, getTimeColor } from '../utils/timeUtils';
import OrderItem from './OrderItem';
import type { Order } from '../utils/types';
import { useOrderTypes } from '../hooks/useOrderTypes';
import { useState, useEffect, useRef } from 'react';

interface Props {
  order: Order | null;
  currentTime: Date;
  activeTab: 'PREPARING' | 'FINISHED';
  getTransactionModifiers: (t: any) => string[];
  onToggleItem: (orderId: number, transId: number, status: string) => void;
  onServirTodo: (order: Order) => void;
  onReabrirTodo: (order: Order) => void;
  onClose: () => void;
}

export default function ExpandedOrder({
  order,
  currentTime,
  activeTab,
  getTransactionModifiers,
  onToggleItem,
  onServirTodo,
  onReabrirTodo,
  onClose,
}: Props) {
  const { orderTypes } = useOrderTypes();
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(0);

  // Verificaciones de seguridad
  if (!order || !order.orderheaders) {
    console.warn('ExpandedOrder: order u orderheaders es undefined');
    return null;
  }

  if (!order.ordertransactions || !Array.isArray(order.ordertransactions)) {
    console.warn('ExpandedOrder: ordertransactions no es un array válido');
    return null;
  }

  const getOrderTypeInfo = (orderType: string) => {
    if (!orderTypes) {
      const defaults = {
        '1': {
          tipo: 'Mesas',
          cliente: order.orderheaders.DineInTableText,
          color: 'bg-blue-800',
          icon: <ChefHat className="w-5 h-5" />
        },
        '2': {
          tipo: 'Para Llevar',
          cliente: order.orderheaders.CustomerName,
          color: 'bg-purple-700',
          icon: <Home className="w-5 h-5" />
        },
        '3': {
          tipo: 'Rappi',
          cliente: order.orderheaders.CustomerName,
          color: 'bg-yellow-500',
          icon: <Utensils className="w-5 h-5" />
        },
        '4': {
          tipo: 'Domicilio',
          cliente: order.orderheaders.CustomerName,
          color: 'bg-orange-500',
          icon: <Car className="w-5 h-5" />
        }
      };
      return defaults[orderType as keyof typeof defaults] || defaults['1'];
    }

    const typeMapping = {
      '1': {
        tipo: orderTypes.DineInAliase,
        cliente: order.orderheaders.DineInTableText,
        color: 'bg-blue-800',
        icon: <ChefHat className="w-5 h-5" />
      },
      '2': {
        tipo: orderTypes.TakeOutAliase,
        cliente: order.orderheaders.CustomerName,
        color: 'bg-purple-700',
        icon: <Home className="w-5 h-5" />
      },
      '3': {
        tipo: orderTypes.DriveThruAliase,
        cliente: order.orderheaders.CustomerName,
        color: 'bg-yellow-500',
        icon: <Utensils className="w-5 h-5" />
      },
      '4': {
        tipo: orderTypes.DeliveryAliase,
        cliente: order.orderheaders.CustomerName,
        color: 'bg-orange-500',
        icon: <Car className="w-5 h-5" />
      }
    };

    return typeMapping[orderType as keyof typeof typeMapping] || typeMapping['1'];
  };

  const orderType = order.orderheaders.OrderType;
  const typeInfo = getOrderTypeInfo(orderType);

  const elapsedTimeString = calculateElapsedTime(order.orderheaders.OrderDateTime);
  const hasUnpreparedItems = order.ordertransactions.some((t) => t?.Status === 'PREPARING');
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

  // Filtrar transacciones válidas
  const validTransactions = order.ordertransactions.filter(trans =>
    trans && typeof trans === 'object' && trans.OrderTransactionID
  );

  // Refs para mantener referencias estables
  const validTransactionsRef = useRef(validTransactions);
  const selectedItemIndexRef = useRef(selectedItemIndex);
  const activeTabRef = useRef(activeTab);
  const orderRef = useRef(order);
  const onCloseRef = useRef(onClose);
  const onToggleItemRef = useRef(onToggleItem);
  const onServirTodoRef = useRef(onServirTodo);
  const onReabrirTodoRef = useRef(onReabrirTodo);

  // Actualizar refs cuando cambian los valores
  useEffect(() => {
    validTransactionsRef.current = validTransactions;
  }, [validTransactions]);

  useEffect(() => {
    selectedItemIndexRef.current = selectedItemIndex;
  }, [selectedItemIndex]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onToggleItemRef.current = onToggleItem;
  }, [onToggleItem]);

  useEffect(() => {
    onServirTodoRef.current = onServirTodo;
  }, [onServirTodo]);

  useEffect(() => {
    onReabrirTodoRef.current = onReabrirTodo;
  }, [onReabrirTodo]);

  // Navegación por teclado en vista expandida
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const itemsCount = validTransactionsRef.current.length;
      const currentSelectedIndex = selectedItemIndexRef.current;
      const currentActiveTab = activeTabRef.current;
      const currentOrder = orderRef.current;

      switch (e.key) {
        case 'Escape':
        case '*':
          e.preventDefault();
          e.stopPropagation();
          onCloseRef.current();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          e.stopPropagation();
          setSelectedItemIndex((prev) => Math.max(0, prev - 1));
          break;

        case 'ArrowRight':
          e.preventDefault();
          e.stopPropagation();
          setSelectedItemIndex((prev) => Math.min(itemsCount - 1, prev + 1));
          break;

        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          // Mover 7 posiciones hacia arriba (una fila en grid de 7 columnas)
          setSelectedItemIndex((prev) => Math.max(0, prev - 7));
          break;

        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          // Mover 7 posiciones hacia abajo
          setSelectedItemIndex((prev) => Math.min(itemsCount - 1, prev + 7));
          break;

        case ' ':
        case '+':
          e.preventDefault();
          e.stopPropagation();
          if (validTransactionsRef.current[currentSelectedIndex]) {
            const trans = validTransactionsRef.current[currentSelectedIndex];
            onToggleItemRef.current(
              currentOrder.orderheaders.OrderID,
              trans.OrderTransactionID,
              trans.Status || 'PREPARING'
            );
          }
          break;

        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (currentActiveTab === 'PREPARING') {
            onServirTodoRef.current(currentOrder);
          } else {
            onReabrirTodoRef.current(currentOrder);
          }
          onCloseRef.current();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []); // Array de dependencias vacío - solo se ejecuta una vez

  // Reset índice si está fuera de rango
  useEffect(() => {
    if (selectedItemIndex >= validTransactions.length && validTransactions.length > 0) {
      setSelectedItemIndex(validTransactions.length - 1);
    }
  }, [validTransactions.length, selectedItemIndex]);

  return (
    <div className="fixed inset-0 bg-black z-100 flex flex-col">
      {/* Header fijo */}
      <div className={`text-white px-6 py-4 flex items-center justify-between ${isOverdue ? 'blink-red' : typeInfo.color} sticky top-0 z-10`}>
        <div className="flex items-center gap-4">
          {typeInfo.icon}
          <div>
            <h1 className="text-2xl font-bold">
              #{order.orderheaders.Turn} - {typeInfo.tipo}
            </h1>
            <p className="text-lg">
              {typeInfo.cliente} - {formatOrderTime(order.orderheaders.OrderDateTime)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            <span className={`text-lg font-bold text-white ${getTimeColor(order.orderheaders.OrderDateTime, currentTime, order.orderheaders.OrderType)}`}>
              {calculateElapsedTime(order.orderheaders.OrderDateTime)}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white bg-opacity-20 hover:bg-opacity-30 transition-all"
            title="Cerrar (ESC o *)"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Información de la orden */}
      <div className="bg-gray-800 text-white px-6 py-3">
        <div className="flex justify-between items-center">
          <div>
            <span className="font-semibold">Orden #: </span>
            {order.orderheaders.OrderID}
          </div>
          <div>
            <span className="font-semibold">Empleado: </span>
            {order.orderheaders.EmployeeName || 'No especificado'}
          </div>
        </div>
        {order.orderheaders.SpecificCustomerName && (
          <div className="mt-2">
            <span className="font-bold text-3xl text-white">
              {order.orderheaders.SpecificCustomerName}
            </span>
          </div>
        )}
      </div>

      {/* Items de la orden en GRID de 7 columnas */}
      <div className="flex-1 overflow-y-auto p-4">
        {validTransactions.length === 0 ? (
          <div className="text-center text-gray-400 text-lg py-8">
            No hay items en esta orden
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-2">
            {validTransactions.map((t, idx) => (
              <div key={t.OrderTransactionID} className="bg-white rounded-lg shadow-sm">
                <OrderItem
                  trans={t}
                  itemName={t.MenuItemText || 'Item sin nombre'}
                  modifiers={getTransactionModifiers(t)}
                  onToggle={() => onToggleItem(
                    order.orderheaders.OrderID,
                    t.OrderTransactionID,
                    t.Status || 'PREPARING'
                  )}
                  isHighlighted={idx === selectedItemIndex}
                  expandedView={true}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer fijo con botones de acción */}
      <div className="bg-gray-800 p-4 border-t border-gray-700 sticky bottom-0">
        <div className="flex gap-4 justify-between items-center">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Regresar (ESC o *)
          </button>

          {activeTab === 'PREPARING' ? (
            <button
              onClick={() => {
                onServirTodo(order);
                onClose();
              }}
              className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold text-xl rounded-lg transition-colors"
              disabled={validTransactions.length === 0}
            >
              SERVIR TODOS (Enter)
            </button>
          ) : (
            <button
              onClick={() => {
                onReabrirTodo(order);
                onClose();
              }}
              className="px-8 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold text-xl rounded-lg transition-colors"
              disabled={validTransactions.length === 0}
            >
              REABRIR TODOS (Enter)
            </button>
          )}
        </div>

        <div className="text-center text-gray-400 mt-2 text-sm">
          ← → : Navegar items | ↑ ↓ : Navegar por filas | Espacio/+: Servir item | Enter: Servir todos
        </div>
      </div>
    </div>
  );
}