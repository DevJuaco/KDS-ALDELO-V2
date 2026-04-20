import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrders } from '../hooks/useOrders';
import Header from '../components/Header';
import OrderCard from '../components/OrderCard';
import ExpandedOrder from '../components/ExpandedOrder';
import Pagination from '../components/Pagination';
import ProductionSummaryModal from '../components/ProductionSummaryModal';

// Calcula las líneas visuales de un conjunto de transacciones
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
      const noteLen = trans.ShortNote.length;
      totalLines += Math.max(1, Math.ceil(noteLen / CHARS_PER_LINE));
    }

    if (trans.TransactionStatus === '2') {
      totalLines += 1;
    }
  });
  return totalLines;
}

// Divide una orden en virtual cards según cuántas líneas caben por card
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
        const modLen = modText.length;
        itemLines += Math.max(1, Math.ceil(modLen / 30));
      });
    }
    if (trans.ShortNote) {
      const noteLen = trans.ShortNote.length;
      itemLines += Math.max(1, Math.ceil(noteLen / 30));
    }
    if (trans.TransactionStatus === '2') itemLines += 1;

    if (currentLines + itemLines > maxLinesPerCard - 1 && currentTransactions.length > 0) {
      cards.push({
        order,
        transactions: currentTransactions,
        partIndex,
        totalParts: 0,
        isContinuation: partIndex > 0,
      });
      partIndex++;
      currentTransactions = [trans];
      currentLines = itemLines;
    } else {
      currentTransactions.push(trans);
      currentLines += itemLines;
    }
  }

  if (currentTransactions.length > 0) {
    cards.push({
      order,
      transactions: currentTransactions,
      partIndex,
      totalParts: 0,
      isContinuation: partIndex > 0,
    });
  }

  const totalParts = cards.length;
  cards.forEach(c => c.totalParts = totalParts);
  return cards;
}

// Paginación fija simple (para modo Grid de 5)
function paginateFixed(cards, limit) {
  const pages = [];
  for (let i = 0; i < cards.length; i += limit) {
    pages.push(cards.slice(i, i + limit));
  }
  return pages;
}

// Paginar virtual cards por capacidad de altura (llenar pantalla)
function paginateByColumnFill(cards, pageHeight) {
  let effectiveHeight = pageHeight;
  if (effectiveHeight === 0) {
    if (typeof window !== 'undefined') {
      effectiveHeight = window.innerHeight - 180;
    }
    if (effectiveHeight <= 0) {
      effectiveHeight = 900;
    }
  }

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
        currentColumnHeight = 0;
      }
      currentPageCards.push(card);
      currentColumnHeight = cardHeight;
    }

    if (isFullColumnCard) {
      currentColumnHeight = effectiveHeight + 9999;
    }
  }

  if (currentPageCards.length > 0) {
    pages.push(currentPageCards);
  }

  return pages;
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('PREPARING');
  const [page, setPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [notificationFilter, setNotificationFilter] = useState(() => {
    const saved = localStorage.getItem('kds-notification-filter');
    return saved || 'all';
  });

  useEffect(() => {
    localStorage.setItem('kds-notification-filter', notificationFilter);
  }, [notificationFilter]);

  const [selectedOrderIndex, setSelectedOrderIndex] = useState(0);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [errorModal, setErrorModal] = useState({ show: false, message: '', orderId: undefined });
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const {
    orders,
    loading: refreshing,
    refreshOrders,
    toggleItemStatus,
    servirTodo,
    reabrirTodo,
    getTransactionModifiers,
  } = useOrders();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Ajuste del número de ítems por página según el ancho
  useEffect(() => {
    const savedDisplaySettings = localStorage.getItem('kds-display-settings');
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setItemsPerPage(5);
      } else {
        setItemsPerPage(savedDisplaySettings ? JSON.parse(savedDisplaySettings).cardsPerPage || 10 : 10);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Efecto para aplicar preferencia de fuente al cargar
  useEffect(() => {
    const savedDisplaySettings = localStorage.getItem('kds-display-settings');
    if (savedDisplaySettings) {
      const settings = JSON.parse(savedDisplaySettings);
      if (settings.useCustomFont === false) {
        document.body.classList.add('use-default-font');
      } else {
        document.body.classList.remove('use-default-font');
      }
    }
  }, []);

  const filtered = useMemo(() => {
    const filteredOrders = orders
      .map((o) => ({
        ...o,
        ordertransactions: o.ordertransactions.filter((t) => {
          if (t.MenuItemNotification === '0' || t.MenuItemNotification === '1') {
            return false;
          }
          if (notificationFilter !== 'all') {
            return t.MenuItemNotification === notificationFilter;
          }
          return true;
        }),
      }))
      .filter((o) => {
        if (o.ordertransactions.length === 0) return false;
        const transactions = o.ordertransactions;
        const hasPreparar = transactions.some((t) => t.Status === 'PREPARING');
        const hasCompletado = transactions.some((t) => t.Status === 'FINISHED');

        if (activeTab === 'PREPARING') {
          return hasPreparar;
        } else {
          return hasCompletado && !hasPreparar;
        }
      });

    if (activeTab === 'FINISHED') {
      return filteredOrders.sort((a, b) => b.orderheaders.OrderID - a.orderheaders.OrderID);
    }

    return filteredOrders;
  }, [orders, notificationFilter, activeTab]);

  const prepararCount = orders.filter(o => {
    const validTransactions = o.ordertransactions.filter(t => {
      if (t.MenuItemNotification === '0' || t.MenuItemNotification === '1') return false;
      if (notificationFilter !== 'all' && t.MenuItemNotification !== notificationFilter) return false;
      return true;
    });
    return validTransactions.length > 0 && validTransactions.some(t => t.Status === 'PREPARING');
  }).length;

  const servidoCount = orders.filter(o => {
    const validTransactions = o.ordertransactions.filter(t => {
      if (t.MenuItemNotification === '0' || t.MenuItemNotification === '1') return false;
      if (notificationFilter !== 'all' && t.MenuItemNotification !== notificationFilter) return false;
      return true;
    });
    const hasPreparar = validTransactions.some(t => t.Status === 'PREPARING');
    const hasCompletado = validTransactions.some(t => t.Status === 'FINISHED');
    return validTransactions.length > 0 && hasCompletado && !hasPreparar;
  }).length;

  const [maxLinesPerCard, setMaxLinesPerCard] = useState(15);
  const [pageHeight, setPageHeight] = useState(0);

  useEffect(() => {
    const updateMetrics = () => {
      if (typeof window === 'undefined') return;
      const cardOverhead = 85;
      const lineHeight = 19;
      const availableHeight = window.innerHeight - 125;
      const maxLines = Math.floor((availableHeight - cardOverhead) / lineHeight);
      setMaxLinesPerCard(Math.max(3, maxLines));
      setPageHeight(availableHeight);
    };
    updateMetrics();
    window.addEventListener('resize', updateMetrics);
    return () => window.removeEventListener('resize', updateMetrics);
  }, []);

  const allVirtualCards = useMemo(() => {
    const cards = [];
    for (const order of filtered) {
      cards.push(...splitOrderIntoCards(order, maxLinesPerCard));
    }
    return cards;
  }, [filtered, maxLinesPerCard]);

  const allPages = useMemo(() => {
    if (itemsPerPage === 5) {
      return paginateFixed(allVirtualCards, 5);
    }
    return paginateByColumnFill(allVirtualCards, pageHeight);
  }, [allVirtualCards, pageHeight, itemsPerPage]);

  const totalPages = allPages.length;
  const paginated = allPages[page] || [];

  // Detectar tecla "-" para mostrar/ocultar el panel de atajos
  useEffect(() => {
    const handleToggleShortcuts = (e) => {
      if (e.key === '-' || e.key === 'Subtract') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleToggleShortcuts);
    return () => window.removeEventListener('keydown', handleToggleShortcuts);
  }, []);

  const expandedOrderRef = useRef(expandedOrder);
  useEffect(() => {
    expandedOrderRef.current = expandedOrder;
  }, [expandedOrder]);

  // Actualizar expandedOrder cuando cambian las órdenes
  useEffect(() => {
    const currentExpandedOrder = expandedOrderRef.current;
    if (currentExpandedOrder) {
      const updatedOrder = filtered.find(
        o => o.orderheaders.OrderID === currentExpandedOrder.orderheaders.OrderID
      );
      if (updatedOrder) {
        const currentOrderStr = JSON.stringify(currentExpandedOrder);
        const updatedOrderStr = JSON.stringify(updatedOrder);
        if (currentOrderStr !== updatedOrderStr) {
          setExpandedOrder(updatedOrder);
        }
      } else {
        setExpandedOrder(null);
      }
    }
  }, [filtered]);

  // Reset selections cuando cambia el filtro o tab
  useEffect(() => {
    setPage(0);
    setSelectedOrderIndex(0);
    setSelectedItemIndex(0);
  }, [notificationFilter, activeTab]);

  // Ajustar página si está fuera de rango
  useEffect(() => {
    if (page >= totalPages && totalPages > 0) {
      setPage(totalPages - 1);
    }
  }, [page, totalPages]);

  // Reset orden seleccionada si está fuera de rango
  useEffect(() => {
    if (selectedOrderIndex >= paginated.length && paginated.length > 0) {
      setSelectedOrderIndex(paginated.length - 1);
    }
    if (paginated.length === 0) {
      setSelectedOrderIndex(0);
    }
  }, [paginated.length, selectedOrderIndex]);

  // Reset item seleccionado si está fuera de rango
  useEffect(() => {
    if (paginated[selectedOrderIndex]) {
      const itemsCount = paginated[selectedOrderIndex].transactions.length;
      if (selectedItemIndex >= itemsCount && itemsCount > 0) {
        setSelectedItemIndex(itemsCount - 1);
      }
      if (itemsCount === 0) {
        setSelectedItemIndex(0);
      }
    }
  }, [paginated, selectedOrderIndex, selectedItemIndex]);

  const handleExpandOrder = (order) => {
    if (order && order.orderheaders) {
      setExpandedOrder(order);
    }
  };

  const handleCloseExpandedOrder = () => {
    setExpandedOrder(null);
  };

  const handleServirTodo = useCallback(async (order) => {
    const result = await servirTodo(order);
    if (result?.error) {
      setErrorModal({
        show: true,
        message: result.error,
        orderId: order.orderheaders.OrderID,
      });
    }
  }, [servirTodo]);

  // Cerrar modal de error con Enter
  useEffect(() => {
    if (!errorModal.show) return;
    const handleEnter = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setErrorModal({ show: false, message: '' });
      }
    };
    window.addEventListener('keydown', handleEnter);
    return () => window.removeEventListener('keydown', handleEnter);
  }, [errorModal.show]);

  // Keyboard navigation principal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (expandedOrder) return;

      const currentCard = paginated[selectedOrderIndex];
      const currentOrder = currentCard?.order;
      const itemsCount = currentCard?.transactions.length || 0;

      switch (e.key) {
        case '.':
          e.preventDefault();
          setShowSummary((prev) => !prev);
          break;
        case '*':
        case 'Multiply':
          e.preventDefault();
          if (currentOrder) handleExpandOrder(currentOrder);
          break;
        case 'Tab':
        case '/':
          e.preventDefault();
          setActiveTab(activeTab === 'PREPARING' ? 'FINISHED' : 'PREPARING');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (selectedOrderIndex > 0) {
            setSelectedOrderIndex((prev) => prev - 1);
          } else if (page > 0) {
            const prevPage = page - 1;
            setPage(prevPage);
            const prevPageItems = allPages[prevPage] || [];
            setSelectedOrderIndex(Math.max(0, prevPageItems.length - 1));
          }
          setSelectedItemIndex(0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (selectedOrderIndex < paginated.length - 1) {
            setSelectedOrderIndex((prev) => prev + 1);
          } else if (page < totalPages - 1) {
            setPage((prev) => prev + 1);
            setSelectedOrderIndex(0);
          }
          setSelectedItemIndex(0);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedItemIndex((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedItemIndex((prev) => Math.min(itemsCount - 1, prev + 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (currentOrder) {
            if (activeTab === 'PREPARING') {
              handleServirTodo(currentOrder);
            } else {
              reabrirTodo(currentOrder);
            }
          }
          break;
        case ' ':
        case '+':
          e.preventDefault();
          if (currentCard && currentCard.transactions[selectedItemIndex]) {
            const trans = currentCard.transactions[selectedItemIndex];
            toggleItemStatus(
              currentCard.order.orderheaders.OrderID,
              trans.OrderTransactionID,
              trans.Status || 'PREPARING'
            );
          }
          break;
        case '0': case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8': case '9': {
          e.preventDefault();
          const pageNum = parseInt(e.key);
          if (pageNum > 0 && pageNum <= totalPages) {
            setPage(pageNum - 1);
            setSelectedOrderIndex(0);
            setSelectedItemIndex(0);
          }
          break;
        }
        case 'PageUp':
          e.preventDefault();
          setPage((p) => Math.max(0, p - 1));
          setSelectedOrderIndex(0);
          setSelectedItemIndex(0);
          break;
        case 'PageDown':
          e.preventDefault();
          setPage((p) => Math.min(totalPages - 1, p + 1));
          setSelectedOrderIndex(0);
          setSelectedItemIndex(0);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, paginated, selectedOrderIndex, selectedItemIndex, page, totalPages, itemsPerPage, handleServirTodo, reabrirTodo, toggleItemStatus, expandedOrder]);

  if (expandedOrder) {
    const currentExpandedOrder = filtered.find(
      o => o.orderheaders.OrderID === expandedOrder.orderheaders.OrderID
    ) || expandedOrder;

    return (
      <ExpandedOrder
        order={currentExpandedOrder}
        currentTime={currentTime}
        activeTab={activeTab}
        getTransactionModifiers={getTransactionModifiers}
        onToggleItem={toggleItemStatus}
        onServirTodo={handleServirTodo}
        onReabrirTodo={reabrirTodo}
        onClose={handleCloseExpandedOrder}
      />
    );
  }

  return (
    <div className="h-screen bg-black text-white flex flex-col">
      {showSummary && (
        <ProductionSummaryModal
          orders={orders}
          notificationFilter={notificationFilter}
          onClose={() => setShowSummary(false)}
        />
      )}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        refreshing={refreshing}
        onRefresh={refreshOrders}
        notificationFilter={notificationFilter}
        onNotificationFilterChange={setNotificationFilter}
        prepararCount={prepararCount}
        servidoCount={servidoCount}
      />

      <div className="flex-1 px-3 pt-3 pb-0 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeTab}-${page}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className={itemsPerPage === 5 ? "h-full grid grid-cols-5 gap-2" : "h-full"}
            style={itemsPerPage === 5 ? {} : {
              columnCount: 5,
              columnGap: '0.5rem',
              columnFill: 'auto',
              orphans: 1,
              widows: 1
            }}
          >
            {paginated.map((card, cardIdx) => {
              const uniqueKey = `${card.order.orderheaders.OrderID}-part${card.partIndex}`;
              return (
                <OrderCard
                  key={uniqueKey}
                  order={card.order}
                  currentTime={currentTime}
                  activeTab={activeTab}
                  getTransactionModifiers={getTransactionModifiers}
                  onToggleItem={toggleItemStatus}
                  onServirTodo={handleServirTodo}
                  onReabrirTodo={reabrirTodo}
                  isSelected={cardIdx === selectedOrderIndex}
                  selectedItemIndex={cardIdx === selectedOrderIndex ? selectedItemIndex : -1}
                  onDoubleClick={() => handleExpandOrder(card.order)}
                  spanRows={1}
                  displayTransactions={card.transactions}
                  isContinuation={card.isContinuation}
                  hasContinuation={card.partIndex < card.totalParts - 1}
                  className={itemsPerPage === 5 ? "h-full" : "mb-2"}
                />
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {totalPages > 1 && (
        <div className="pb-2 px-3 pt-1">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPrev={() => {
              setPage((p) => Math.max(p - 1, 0));
              setSelectedOrderIndex(0);
              setSelectedItemIndex(0);
            }}
            onNext={() => {
              setPage((p) => Math.min(p + 1, totalPages - 1));
              setSelectedOrderIndex(0);
              setSelectedItemIndex(0);
            }}
          />
        </div>
      )}

      {/* MODAL DE ERROR */}
      {errorModal.show && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]">
          <div className="bg-gray-900 border border-red-500/50 rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-red-400">Error al servir orden</h3>
                {errorModal.orderId && (
                  <p className="text-gray-400 text-sm">Orden #{errorModal.orderId}</p>
                )}
              </div>
            </div>
            <div className="bg-red-950/30 border border-red-800/40 rounded-lg p-4 mb-5">
              <p className="text-gray-300 text-sm font-mono whitespace-pre-wrap break-all">
                {errorModal.message}
              </p>
            </div>
            <button
              onClick={() => setErrorModal({ show: false, message: '' })}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl transition-colors text-lg"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {showShortcuts && (
        <div className="fixed bottom-4 left-4 bg-gray-900 text-gray-300 px-4 py-2 rounded-lg text-xs opacity-75 z-50">
          <div className="font-bold mb-1">Atajos de teclado:</div>
          <div>← → : Navegar órdenes | ↑ ↓ : Navegar ítems</div>
          <div>Tab o /: Cambiar pestaña | Enter: Servir/Reabrir Orden | Espacio o +: Servir ítem</div>
          <div>1-9: Ir a página | PageUp/PageDown: Cambiar página</div>
          <div>* : Expandir orden | . : Resumen Producción | - : Mostrar/Ocultar ayuda</div>
        </div>
      )}
    </div>
  );
}
