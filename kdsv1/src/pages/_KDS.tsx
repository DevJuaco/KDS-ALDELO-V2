import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClock } from '../hooks/useClock';
import { useOrders } from '../hooks/useOrders';
import KDSHeader from '../components/KDSHeader';
import OrderCard from '../components/OrderCard';
import ExpandedOrder from '../components/ExpandedOrder';
import Pagination from '../components/Pagination';
import ProductionSummaryModal from '../components/ProductionSummaryModal';
import type { Order } from '../utils/types';

// Tipo para tarjeta virtual (una orden puede dividirse en varias tarjetas)
interface VirtualCard {
  order: Order;
  transactions: any[]; // subset de ordertransactions
  partIndex: number;    // 0 = primera parte, 1 = continuación, etc.
  totalParts: number;   // total de partes de esta orden
  isContinuation: boolean;
}

// Calcula las líneas visuales de un conjunto de transacciones
function countVisualLines(transactions: any[]): number {
  let totalLines = 0;
  // Estimación conservadora de caracteres por línea (width ~300px, font relative)
  // Reducido a 30 para ser más agresivo con el wrapping
  const CHARS_PER_LINE = 30;

  transactions.forEach((trans) => {
    // Item principal
    const textLen = (trans.MenuItemText || '').length;
    // Mínimo 1 línea, sumar extras si se pasa del ancho
    totalLines += Math.max(1, Math.ceil(textLen / CHARS_PER_LINE));

    // Modificadores
    if (trans.modifiers && Array.isArray(trans.modifiers)) {
      trans.modifiers.forEach((mod: any) => {
        // mod puede ser string o tener prop ModifierText
        const modText = typeof mod === 'string' ? mod : (mod.ModifierText || '');
        const modLen = modText.length;
        totalLines += Math.max(1, Math.ceil(modLen / CHARS_PER_LINE));
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
function splitOrderIntoCards(order: Order, maxLinesPerCard: number): VirtualCard[] {
  const transactions = order.ordertransactions;
  const totalLines = countVisualLines(transactions);

  // Si cabe en una sola card, no dividir
  if (totalLines <= maxLinesPerCard) {
    return [{
      order,
      transactions,
      partIndex: 0,
      totalParts: 1,
      isContinuation: false,
    }];
  }

  // Dividir en chunks que quepan
  const cards: VirtualCard[] = [];
  let currentTransactions: any[] = [];
  let currentLines = 0;
  let partIndex = 0;

  for (const trans of transactions) {
    let itemLines = 0;
    // Calcular líneas de este item específico
    const textLen = (trans.MenuItemText || '').length;
    itemLines += Math.max(1, Math.ceil(textLen / 30));

    if (trans.modifiers && Array.isArray(trans.modifiers)) {
      trans.modifiers.forEach((mod: any) => {
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

    // Reservar 1 línea para "Continued..." al final
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

  // Última card
  if (currentTransactions.length > 0) {
    cards.push({
      order,
      transactions: currentTransactions,
      partIndex,
      totalParts: 0,
      isContinuation: partIndex > 0,
    });
  }

  // Actualizar totalParts
  const totalParts = cards.length;
  cards.forEach(c => c.totalParts = totalParts);

  return cards;
}

// Paginación fija simple (para modo Grid de 5)
function paginateFixed(cards: VirtualCard[], limit: number): VirtualCard[][] {
  const pages: VirtualCard[][] = [];
  for (let i = 0; i < cards.length; i += limit) {
    pages.push(cards.slice(i, i + limit));
  }
  return pages;
}

// Paginar virtual cards por capacidad de altura (llenar pantalla)
function paginateByColumnFill(cards: VirtualCard[], pageHeight: number): VirtualCard[][] {
  // Si no hay altura (SSR o inicial), intentar usar window.innerHeight
  // o un valor por defecto que permitan calcular columnas
  let effectiveHeight = pageHeight;
  if (effectiveHeight === 0) {
    if (typeof window !== 'undefined') {
      effectiveHeight = window.innerHeight - 180;
    }
    // Si aún así no tenemos altura válida, usar 900px por defecto
    if (effectiveHeight <= 0) {
      effectiveHeight = 900;
    }
  }

  // Altura mínima 500px para seguridad
  effectiveHeight = Math.max(effectiveHeight, 500);
  const COLUMNS = 5;
  const GAP = 8; // 0.5rem gap

  const pages: VirtualCard[][] = [];
  let currentPageCards: VirtualCard[] = [];

  // Estado actual de llenado de la página
  let currentColumnIndex = 0;
  let currentColumnHeight = 0;

  for (const card of cards) {
    // Estimar altura
    const lines = countVisualLines(card.transactions);
    const cardHeight = (lines * 19) + 85;

    // Lógica para partes de órdenes divididas (Split Orders)
    // Si es una parte intermedia (ej: Parte 1 de 2), asume que ocupa TODO el resto de la columna.
    // Esto evita que intentemos apilar algo debajo de una tarjeta que ya fue cortada por falta de espacio.
    const isFullColumnCard = card.totalParts > 1 && card.partIndex < card.totalParts - 1;

    // Si es Full Height y la columna ya tiene algo, saltar a la siguiente inmediatamente
    // para que la Start Card empiece limpia
    if (isFullColumnCard && currentColumnHeight > 0) {
      // Forzar salto de columna
      currentColumnIndex++;
      if (currentColumnIndex >= COLUMNS) {
        pages.push(currentPageCards);
        currentPageCards = [];
        currentColumnIndex = 0;
        currentColumnHeight = 0;
      } else {
        // Nueva columna en misma página
        currentColumnHeight = 0;
      }
    }

    // Calcular altura si añadimos a la columna actual
    const heightToAdd = currentColumnHeight > 0 ? GAP + cardHeight : cardHeight;
    const newHeight = currentColumnHeight + heightToAdd;

    // Check de espacio standard
    if (newHeight <= effectiveHeight) {
      // Cabe, agregamos
      currentPageCards.push(card);
      currentColumnHeight = newHeight;
    } else {
      // No cabe, cerrar columna actual e intentar en la siguiente
      currentColumnIndex++;

      // Si ya llenamos las 5 columnas, cerramos la página
      if (currentColumnIndex >= COLUMNS) {
        pages.push(currentPageCards);

        // Reset para nueva página (columna 0)
        currentPageCards = [];
        currentColumnIndex = 0;
        currentColumnHeight = 0;
      }

      // Intentar agregar en la nueva columna
      // Nota: Si una sola tarjeta es más alta que toda la columna,
      // la forzamos a entrar
      currentPageCards.push(card);
      currentColumnHeight = cardHeight;
    }

    // Si acabamos de insertar una tarjeta que llena la columna (Part 1...),
    // marcamos la columna como LLENA artificialmente para que la siguiente (Part 2)
    // se vea forzada a ir a la siguiente columna/página.
    if (isFullColumnCard) {
      currentColumnHeight = effectiveHeight + 9999;
    }
  }

  if (currentPageCards.length > 0) {
    pages.push(currentPageCards);
  }

  return pages;
}

export default function KDS() {
  const [activeTab, setActiveTab] = useState<'PREPARING' | 'FINISHED'>('PREPARING');
  const [page, setPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [notificationFilter, setNotificationFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('kds-notification-filter');
      return saved || 'all';
    }
    return 'all';
  });

  useEffect(() => {
    localStorage.setItem('kds-notification-filter', notificationFilter);
  }, [notificationFilter]);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState<number>(0);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [errorModal, setErrorModal] = useState<{ show: boolean; message: string; orderId?: number }>({ show: false, message: '' });

  const [expandedOrder, setExpandedOrder] = useState<Order | null>(null);

  const { currentTime } = useClock();

  const {
    orders,
    refreshing,
    refreshOrders,
    toggleItemStatus,
    servirTodo,
    reabrirTodo,
    getTransactionModifiers,
  } = useOrders();

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
      // Si useCustomFont es false explícitamente, aplicar la clase
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

    // Ordenar de mayor a menor (descendente) solo para la pestaña FINISHED
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

  // Calcular maxLinesPerCard dinámicamente basado en resolución
  const [maxLinesPerCard, setMaxLinesPerCard] = useState(15); // Default para SSR
  const [pageHeight, setPageHeight] = useState(0); // 0 = SSR, se actualiza en cliente

  useEffect(() => {
    const updateMetrics = () => {
      if (typeof window === 'undefined') return;

      const cardOverhead = 85; // Ajustado para header+footer reales + margins
      const lineHeight = 19;
      // Reduced subtraction to 125 to reclaim bottom space
      const availableHeight = window.innerHeight - 125;
      const maxLines = Math.floor((availableHeight - cardOverhead) / lineHeight);
      // Asegurar un mínimo razonable
      setMaxLinesPerCard(Math.max(3, maxLines));
      setPageHeight(availableHeight); // Forzar recalculo de paginación
    };

    updateMetrics(); // Ejecutar al montar
    window.addEventListener('resize', updateMetrics);
    return () => window.removeEventListener('resize', updateMetrics);
  }, []);

  // Generar virtual cards (dividiendo órdenes largas en múltiples tarjetas)
  const allVirtualCards = useMemo(() => {
    const cards: VirtualCard[] = [];
    for (const order of filtered) {
      cards.push(...splitOrderIntoCards(order, maxLinesPerCard));
    }
    return cards;
  }, [filtered, maxLinesPerCard]);

  // Paginación dinámica: Si es 5 items, usar Grid fijo. Si no, usar Masonry dinámico por altura.
  const allPages = useMemo(() => {
    if (itemsPerPage === 5) {
      return paginateFixed(allVirtualCards, 5);
    }
    return paginateByColumnFill(allVirtualCards, pageHeight);
  }, [allVirtualCards, pageHeight, itemsPerPage]);
  const totalPages = allPages.length;
  const paginated = allPages[page] || [];


  // Detectar tecla "-" o "Subtract" para mostrar/ocultar el panel
  useEffect(() => {
    const handleToggleShortcuts = (e: KeyboardEvent) => {
      if (e.key === '-' || e.key === 'Subtract') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleToggleShortcuts);
    return () => window.removeEventListener('keydown', handleToggleShortcuts);
  }, []);

  // Ref para mantener referencia actual de expandedOrder
  const expandedOrderRef = useRef<Order | null>(expandedOrder);

  // Actualizar el ref cuando expandedOrder cambia
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
        // Solo actualizar si la orden realmente cambió (comparar por serialización)
        // Esto evita actualizaciones innecesarias que causan bucles
        const currentOrderStr = JSON.stringify(currentExpandedOrder);
        const updatedOrderStr = JSON.stringify(updatedOrder);
        if (currentOrderStr !== updatedOrderStr) {
          setExpandedOrder(updatedOrder);
        }
      } else {
        // Si la orden ya no existe en filtered, cerrar la vista expandida
        setExpandedOrder(null);
      }
    }
  }, [filtered]); // Solo depender de filtered

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

  // Función para expandir orden
  const handleExpandOrder = (order: Order) => {
    if (order && order.orderheaders) {
      setExpandedOrder(order);
    } else {
      console.warn('Intento de expandir orden inválida:', order);
    }
  };

  // Función para cerrar orden expandida
  const handleCloseExpandedOrder = () => {
    setExpandedOrder(null);
  };

  // Wrapper para servirTodo con manejo de errores
  const handleServirTodo = useCallback(async (order: Order) => {
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
    const handleEnter = (e: KeyboardEvent) => {
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Si hay una orden expandida, no manejar teclas aquí
      if (expandedOrder) {
        return;
      }

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
          if (currentOrder) {
            handleExpandOrder(currentOrder);
          }
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
            // Seleccionar el último elemento de la página anterior
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
        case '5': case '6': case '7': case '8': case '9':
          e.preventDefault();
          const pageNum = parseInt(e.key);
          if (pageNum > 0 && pageNum <= totalPages) {
            setPage(pageNum - 1);
            setSelectedOrderIndex(0);
            setSelectedItemIndex(0);
          }
          break;
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

  // Si hay una orden expandida, buscar la versión actualizada y mostrarla
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
      <KDSHeader
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