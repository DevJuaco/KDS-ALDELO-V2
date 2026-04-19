import { X, Clock, ChefHat, Home, Utensils, Car, ArrowLeft } from 'lucide-react';
import { formatOrderTime, calculateElapsedTime, getTimeColor } from '../utils/timeUtils';
import OrderItem from './OrderItem';
import { useOrderTypes } from '../hooks/useOrderTypes';
import { useState, useEffect, useRef } from 'react';

export default function ExpandedOrder({
  order,
  currentTime,
  activeTab,
  getTransactionModifiers,
  onToggleItem,
  onServirTodo,
  onReabrirTodo,
  onClose,
}) {
  const { orderTypes } = useOrderTypes();
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);

  if (!order || !order.orderheaders) {
    return null;
  }

  const getOrderTypeInfo = (orderType) => {
    const typeMapping = {
      '1': {
        tipo: orderTypes?.DineInAliase || 'Mesas',
        cliente: order.orderheaders.DineInTableText,
        color: 'bg-blue-800',
        icon: <ChefHat className="w-5 h-5" />
      },
      '2': {
        tipo: orderTypes?.TakeOutAliase || 'Para Llevar',
        cliente: order.orderheaders.CustomerName,
        color: 'bg-purple-700',
        icon: <Home className="w-5 h-5" />
      },
      '3': {
        tipo: orderTypes?.DriveThruAliase || 'Rappi',
        cliente: order.orderheaders.CustomerName,
        color: 'bg-yellow-500',
        icon: <Utensils className="w-5 h-5" />
      },
      '4': {
        tipo: orderTypes?.DeliveryAliase || 'Domicilio',
        cliente: order.orderheaders.CustomerName,
        color: 'bg-orange-500',
        icon: <Car className="w-5 h-5" />
      }
    };

    return typeMapping[orderType] || typeMapping['1'];
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

  const validTransactions = order.ordertransactions.filter(trans =>
    trans && typeof trans === 'object' && trans.OrderTransactionID
  );

  const validTransactionsRef = useRef(validTransactions);
  const selectedItemIndexRef = useRef(selectedItemIndex);
  const activeTabRef = useRef(activeTab);
  const orderRef = useRef(order);
  const onCloseRef = useRef(onClose);
  const onToggleItemRef = useRef(onToggleItem);
  const onServirTodoRef = useRef(onServirTodo);
  const onReabrirTodoRef = useRef(onReabrirTodo);

  useEffect(() => {
    validTransactionsRef.current = validTransactions;
    selectedItemIndexRef.current = selectedItemIndex;
    activeTabRef.current = activeTab;
    orderRef.current = order;
    onCloseRef.current = onClose;
    onToggleItemRef.current = onToggleItem;
    onServirTodoRef.current = onServirTodo;
    onReabrirTodoRef.current = onReabrirTodo;
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const itemsCount = validTransactionsRef.current.length;
      const currentSelectedIndex = selectedItemIndexRef.current;
      const currentActiveTab = activeTabRef.current;
      const currentOrder = orderRef.current;

      switch (e.key) {
        case 'Escape':
        case '*':
          e.preventDefault();
          onCloseRef.current();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setSelectedItemIndex((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setSelectedItemIndex((prev) => Math.min(itemsCount - 1, prev + 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedItemIndex((prev) => Math.max(0, prev - 7));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedItemIndex((prev) => Math.min(itemsCount - 1, prev + 7));
          break;
        case ' ':
        case '+':
          e.preventDefault();
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
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  useEffect(() => {
    if (selectedItemIndex >= validTransactions.length && validTransactions.length > 0) {
      setSelectedItemIndex(validTransactions.length - 1);
    }
  }, [validTransactions.length, selectedItemIndex]);

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      <div className={`text-white px-6 py-4 flex items-center justify-between ${isOverdue ? 'blink-red' : typeInfo.color} sticky top-0 z-10 shadow-xl`}>
        <div className="flex items-center gap-4">
          {typeInfo.icon}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              #{order.orderheaders.Turn} - {typeInfo.tipo}
            </h1>
            <p className="text-lg opacity-90 font-medium">
              {typeInfo.cliente} - {formatOrderTime(order.orderheaders.OrderDateTime)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 bg-black/20 px-4 py-2 rounded-xl">
            <Clock className="w-5 h-5 text-white" />
            <span className={`text-xl font-black ${getTimeColor(order.orderheaders.OrderDateTime, currentTime, order.orderheaders.OrderType)}`}>
              {calculateElapsedTime(order.orderheaders.OrderDateTime)}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-all border border-white/10 shadow-lg"
            title="Cerrar (ESC o *)"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>

      <div className="bg-zinc-900 text-white px-6 py-4 border-b border-zinc-800 shadow-lg flex justify-between items-center">
        <div className="flex gap-8 items-center">
          <div>
            <span className="text-zinc-500 font-bold uppercase text-xs tracking-widest block mb-1">Orden #</span>
            <span className="text-xl font-mono">{order.orderheaders.OrderID}</span>
          </div>
          <div className="h-10 w-px bg-zinc-800" />
          <div>
            <span className="text-zinc-500 font-bold uppercase text-xs tracking-widest block mb-1">Empleado</span>
            <span className="text-xl font-bold">{order.orderheaders.EmployeeName || 'No especificado'}</span>
          </div>
        </div>
        
        {order.orderheaders.SpecificCustomerName && (
          <div className="bg-white text-black px-6 py-2 rounded-2xl shadow-xl">
            <span className="text-xs font-black uppercase tracking-widest block text-zinc-500 mb-0.5">Identificador</span>
            <span className="text-4xl font-black leading-none">
              {order.orderheaders.SpecificCustomerName}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-zinc-950">
        {validTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-4">
            <Utensils className="w-20 h-20 opacity-20" />
            <span className="text-2xl font-bold italic">No hay items en esta orden</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-4">
            {validTransactions.map((t, idx) => (
              <div 
                key={t.OrderTransactionID} 
                className={`rounded-2xl transition-all duration-200 transform ${
                  idx === selectedItemIndex ? 'scale-105 ring-4 ring-white shadow-2xl' : 'opacity-80'
                }`}
              >
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

      <div className="bg-zinc-900 p-6 border-t border-zinc-800 sticky bottom-0 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        <div className="flex gap-6 justify-between items-center max-w-[1600px] mx-auto">
          <button
            onClick={onClose}
            className="flex items-center gap-3 px-8 py-4 bg-zinc-700 hover:bg-zinc-600 text-white font-black rounded-2xl transition-all shadow-xl active:scale-95"
          >
            <ArrowLeft className="w-6 h-6" />
            REGRESAR (ESC o *)
          </button>

          {activeTab === 'PREPARING' ? (
            <button
              onClick={() => {
                onServirTodo(order);
                onClose();
              }}
              className="px-12 py-4 bg-green-600 hover:bg-green-500 text-white font-black text-2xl rounded-2xl transition-all shadow-[0_10px_30px_rgba(22,163,74,0.3)] active:scale-95 disabled:opacity-50"
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
              className="px-12 py-4 bg-zinc-700 hover:bg-zinc-600 text-white font-black text-2xl rounded-2xl transition-all shadow-xl active:scale-95 disabled:opacity-50"
              disabled={validTransactions.length === 0}
            >
              REABRIR TODOS (Enter)
            </button>
          )}
        </div>

        <div className="flex justify-center gap-8 text-zinc-500 mt-4 text-xs font-bold tracking-widest uppercase">
          <div className="flex items-center gap-2"><span className="bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700 text-zinc-300">← →</span> Navegar items</div>
          <div className="flex items-center gap-2"><span className="bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700 text-zinc-300">↑ ↓</span> Cambiar fila</div>
          <div className="flex items-center gap-2"><span className="bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700 text-zinc-300">Space / +</span> Servir item</div>
          <div className="flex items-center gap-2"><span className="bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700 text-zinc-300">Enter</span> Servir todos</div>
        </div>
      </div>
    </div>
  );
}
