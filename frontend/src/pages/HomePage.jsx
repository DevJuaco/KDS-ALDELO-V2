import { useEffect, useState, useMemo } from 'react';
import Header from '../components/Header';
import OrderCard from '../components/OrderCard';
import ExpandedOrder from '../components/ExpandedOrder';
import Pagination from '../components/Pagination';
import ProductionSummaryModal from '../components/ProductionSummaryModal';
import { useOrders } from '../hooks/useOrders';

// --- LOGICA DE LAYOUT ---

function countVisualLines(transactions) {
  let totalLines = 0;
  const CHARS_PER_LINE = 30;

  (transactions || []).forEach((trans) => {
    const textLen = (trans.MenuItemText || '').length;
    totalLines += Math.max(1, Math.ceil(textLen / CHARS_PER_LINE));

    if (trans.modifiers && Array.isArray(trans.modifiers)) {
      trans.modifiers.forEach((mod) => {
        const modText = typeof mod === 'string' ? mod : (mod.ModifierText || '');
        totalLines += Math.max(1, Math.ceil(modText.length / CHARS_PER_LINE));
      });
    }

    if (trans.ShortNote) {
      totalLines += Math.max(1, Math.ceil(trans.ShortNote.length / CHARS_PER_LINE));
    }
  });
  return totalLines;
}

function splitOrderIntoCards(order, maxLinesPerCard) {
  const transactions = order.ordertransactions || [];
  const totalLines = countVisualLines(transactions);

  if (totalLines <= maxLinesPerCard) {
    return [{
      order,
      transactions,
      partIndex: 0,
      totalParts: 1,
      isContinuation: false,
    }];
  }

  const cards = [];
  let currentTransactions = [];
  let currentLines = 0;
  let partIndex = 0;

  for (const trans of transactions) {
    let itemLines = 0;
    const textLen = (trans.MenuItemText || '').length;
    itemLines += Math.max(1, Math.ceil(textLen / 30));

    if (trans.modifiers && Array.isArray(trans.modifiers)) {
      trans.modifiers.forEach((mod) => {
        const modText = typeof mod === 'string' ? mod : (mod.ModifierText || '');
        itemLines += Math.max(1, Math.ceil(modText.length / 30));
      });
    }

    if (currentLines + itemLines > maxLinesPerCard - 1 && currentTransactions.length > 0) {
      cards.push({ order, transactions: currentTransactions, partIndex, totalParts: 0, isContinuation: partIndex > 0 });
      partIndex++;
      currentTransactions = [trans];
      currentLines = itemLines;
    } else {
      currentTransactions.push(trans);
      currentLines += itemLines;
    }
  }

  if (currentTransactions.length > 0) {
    cards.push({ order, transactions: currentTransactions, partIndex, totalParts: 0, isContinuation: partIndex > 0 });
  }

  const totalParts = cards.length;
  cards.forEach(c => c.totalParts = totalParts);
  return cards;
}

function paginateByColumnFill(cards, pageHeight) {
  let effectiveHeight = pageHeight;
  effectiveHeight = Math.max(effectiveHeight, 500);
  const COLUMNS = 5;
  const GAP = 8;

  const pages = [];
  let currentPageCards = [];
  let currentColumnIndex = 0;
  let currentColumnHeight = 0;

  for (const card of cards) {
    const lines = countVisualLines(card.transactions);
    const cardHeight = (lines * 19) + 85;
    const isFullColumnCard = card.totalParts > 1 && card.partIndex < card.totalParts - 1;

    if (isFullColumnCard && currentColumnHeight > 0) {
      currentColumnIndex++;
      if (currentColumnIndex >= COLUMNS) {
        pages.push(currentPageCards);
        currentPageCards = [];
        currentColumnIndex = 0;
        currentColumnHeight = 0;
      } else {
        currentColumnHeight = 0;
      }
    }

    const heightToAdd = currentColumnHeight > 0 ? GAP + cardHeight : cardHeight;
    const newHeight = currentColumnHeight + heightToAdd;

    if (newHeight <= effectiveHeight) {
      currentPageCards.push(card);
      currentColumnHeight = newHeight;
    } else {
      currentColumnIndex++;
      if (currentColumnIndex >= COLUMNS) {
        pages.push(currentPageCards);
        currentPageCards = [];
        currentColumnIndex = 0;
      }
      currentPageCards.push(card);
      currentColumnHeight = cardHeight;
    }

    if (isFullColumnCard) {
      currentColumnHeight = effectiveHeight + 9999;
    }
  }

  if (currentPageCards.length > 0) pages.push(currentPageCards);
  return pages;
}

// --- COMPONENTE PRINCIPAL ---

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('PREPARING');
  const [page, setPage] = useState(0);
  const [notificationFilter, setNotificationFilter] = useState('all');
  const [selectedOrderIndex, setSelectedOrderIndex] = useState(0);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // HOOK DE DATOS REALES
  const { 
    orders, 
    loading, 
    isConnected, 
    toggleItemStatus, 
    servirTodo, 
    reabrirTodo, 
    getTransactionModifiers 
  } = useOrders();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [maxLinesPerCard, setMaxLinesPerCard] = useState(15);
  const [pageHeight, setPageHeight] = useState(900);

  useEffect(() => {
    const updateMetrics = () => {
      const availableHeight = window.innerHeight - 130;
      setMaxLinesPerCard(Math.max(3, Math.floor((availableHeight - 85) / 19)));
      setPageHeight(availableHeight);
    };
    updateMetrics();
    window.addEventListener('resize', updateMetrics);
    return () => window.removeEventListener('resize', updateMetrics);
  }, []);

  // Filtrado por Tab y Zona
  const filtered = useMemo(() => {
    return orders.filter(o => {
      // Filtrar por zona de notificación (si aplica)
      const hasValidItems = o.ordertransactions.some(t => {
        if (notificationFilter !== 'all' && t.MenuItemNotification !== notificationFilter) return false;
        return true;
      });
      if (!hasValidItems) return false;

      // Filtrar por estado de la pestaña
      const hasPreparing = o.ordertransactions.some(t => t.Status === 'PREPARING');
      if (activeTab === 'PREPARING') return hasPreparing;
      return !hasPreparing;
    });
  }, [orders, activeTab, notificationFilter]);

  const allVirtualCards = useMemo(() => {
    const cards = [];
    filtered.forEach(order => cards.push(...splitOrderIntoCards(order, maxLinesPerCard)));
    return cards;
  }, [filtered, maxLinesPerCard]);

  const allPages = useMemo(() => paginateByColumnFill(allVirtualCards, pageHeight), [allVirtualCards, pageHeight]);
  const paginated = allPages[page] || [];
  const totalPages = allPages.length;

  useEffect(() => {
    setPage(0);
    setSelectedOrderIndex(0);
    setSelectedItemIndex(0);
  }, [activeTab, notificationFilter]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (expandedOrder || showSummary || e.target instanceof HTMLInputElement) return;

      const currentCard = paginated[selectedOrderIndex];
      const itemsCount = currentCard?.transactions?.length || 0;

      switch (e.key) {
        case '.': e.preventDefault(); setShowSummary(s => !s); break;
        case '*': e.preventDefault(); if (currentCard) setExpandedOrder(currentCard.order); break;
        case 'Tab': case '/': e.preventDefault(); setActiveTab(t => t === 'PREPARING' ? 'FINISHED' : 'PREPARING'); break;
        case 'ArrowLeft':
          e.preventDefault();
          if (selectedOrderIndex > 0) setSelectedOrderIndex(i => i - 1);
          else if (page > 0) { setPage(p => p - 1); setSelectedOrderIndex(0); }
          setSelectedItemIndex(0); break;
        case 'ArrowRight':
          e.preventDefault();
          if (selectedOrderIndex < paginated.length - 1) setSelectedOrderIndex(i => i + 1);
          else if (page < totalPages - 1) { setPage(p => p + 1); setSelectedOrderIndex(0); }
          setSelectedItemIndex(0); break;
        case 'ArrowUp': e.preventDefault(); setSelectedItemIndex(i => Math.max(0, i - 1)); break;
        case 'ArrowDown': e.preventDefault(); setSelectedItemIndex(i => Math.min(itemsCount - 1, i + 1)); break;
        case 'Enter':
          e.preventDefault();
          if (currentCard) activeTab === 'PREPARING' ? servirTodo(currentCard.order) : reabrirTodo(currentCard.order);
          break;
        case ' ': case '+':
          e.preventDefault();
          if (currentCard?.transactions[selectedItemIndex]) {
            const trans = currentCard.transactions[selectedItemIndex];
            toggleItemStatus(currentCard.order.orderheaders.OrderID, trans.OrderTransactionID, trans.Status);
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paginated, selectedOrderIndex, selectedItemIndex, page, expandedOrder, showSummary, activeTab]);

  if (expandedOrder) {
    const currentExpandedOrder = orders.find(o => o.orderheaders.OrderID === expandedOrder.orderheaders.OrderID) || expandedOrder;
    return (
      <ExpandedOrder
        order={currentExpandedOrder}
        currentTime={currentTime}
        activeTab={activeTab}
        getTransactionModifiers={getTransactionModifiers}
        onToggleItem={toggleItemStatus}
        onServirTodo={servirTodo}
        onReabrirTodo={reabrirTodo}
        onClose={() => setExpandedOrder(null)}
      />
    );
  }

  return (
    <div className="h-screen bg-black text-white flex flex-col overflow-hidden font-sans">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        refreshing={false}
        prepararCount={orders.filter(o => o.ordertransactions.some(t => t.Status === 'PREPARING')).length}
        servidoCount={orders.filter(o => !o.ordertransactions.some(t => t.Status === 'PREPARING')).length}
        notificationFilter={notificationFilter}
        onNotificationFilterChange={setNotificationFilter}
      />

      {loading && (
        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-[200] backdrop-blur-sm">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-xl font-black uppercase tracking-widest animate-pulse">Conectando al servidor KDS...</p>
        </div>
      )}

      <div className="flex-1 px-4 pt-4 pb-0 overflow-hidden">
        {orders.length === 0 && !loading ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-700">
             <span className="text-4xl font-black uppercase italic opacity-20">Sin Órdenes Activas</span>
          </div>
        ) : (
          <div className="h-full" style={{ columnCount: 5, columnGap: '0.75rem', columnFill: 'auto' }}>
            {paginated.map((card, cardIdx) => (
              <div key={`${card.order.orderheaders.OrderID}-part${card.partIndex}`} className="mb-3 break-inside-avoid">
                <OrderCard
                  order={card.order}
                  currentTime={currentTime}
                  activeTab={activeTab}
                  getTransactionModifiers={getTransactionModifiers}
                  onToggleItem={toggleItemStatus}
                  onServirTodo={servirTodo}
                  onReabrirTodo={reabrirTodo}
                  isSelected={cardIdx === selectedOrderIndex}
                  selectedItemIndex={cardIdx === selectedOrderIndex ? selectedItemIndex : -1}
                  onDoubleClick={() => setExpandedOrder(card.order)}
                  displayTransactions={card.transactions}
                  isContinuation={card.isContinuation}
                  hasContinuation={card.partIndex < card.totalParts - 1}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pb-4 pt-2">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between px-6">
           <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                {isConnected ? 'Online' : 'Offline'}
              </span>
           </div>

           {totalPages > 1 && (
             <Pagination
               currentPage={page}
               totalPages={totalPages}
               onPrev={() => setPage(p => Math.max(0, p - 1))}
               onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
             />
           )}

           <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
             KDS Aldelo v2.0
           </div>
        </div>
      </div>

      {showSummary && (
        <ProductionSummaryModal
          orders={orders}
          notificationFilter={notificationFilter}
          onClose={() => setShowSummary(false)}
        />
      )}
    </div>
  );
}
