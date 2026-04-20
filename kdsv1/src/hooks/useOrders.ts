import { useState, useEffect, useCallback, useRef } from "react";
import {
  getOperationalDate,
  fetchFirstOrderId,
  fetchOrdersFromQueue,
  fetchSavedKDSStates,
  postKDSOrder,
  putOrderServed,
  putServeAllOrder,
  putKDSOrdersBulk,
  fetchVoidsByOrder,
} from "../services/kdsService";
import type { Order } from "../utils/types";

function getDailyOrderNumber(orderId: number, firstOrderId: number): number {
  return orderId - firstOrderId + 1;
}

function resolveMenuItemNotification(transaction: any): string | undefined {
  const notification =
    transaction?.MenuItemNotification ??
    transaction?.menuItemNotification ??
    transaction?.NotificationStatus ??
    transaction?.notificationStatus;

  return notification != null ? String(notification) : undefined;
}

type CombinedVoidCountMap = Record<number, Record<string, number>>;

function normalizeCombinedProduct(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizeCombinedQuantity(value: unknown): number {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue)
    ? Number(numericValue.toFixed(3))
    : 0;
}

function getCombinedVoidKey(product: unknown, quantity: unknown): string {
  const normalizedProduct = normalizeCombinedProduct(product);
  if (!normalizedProduct) return "";

  return `${normalizedProduct}__${normalizeCombinedQuantity(quantity).toFixed(3)}`;
}

function buildCombinedVoidCountMap(
  voidsByOrder: Record<number, any[]> = {},
): CombinedVoidCountMap {
  const map: CombinedVoidCountMap = {};

  Object.entries(voidsByOrder).forEach(([orderIdStr, voids]) => {
    const orderId = Number(orderIdStr);
    if (!Number.isFinite(orderId) || !Array.isArray(voids)) return;

    voids.forEach((voidItem) => {
      const key = getCombinedVoidKey(
        voidItem?.Producto ?? voidItem?.MenuItemText ?? voidItem?.ItemName,
        voidItem?.Cantidad ?? voidItem?.Quantity,
      );

      if (!key) return;

      if (!map[orderId]) {
        map[orderId] = {};
      }

      map[orderId][key] = (map[orderId][key] ?? 0) + 1;
    });
  });

  return map;
}

function cloneCombinedVoidCountMap(map: CombinedVoidCountMap): CombinedVoidCountMap {
  return Object.fromEntries(
    Object.entries(map).map(([orderId, entries]) => [orderId, { ...entries }]),
  );
}

function mergeCombinedVoidCountMaps(
  ...maps: CombinedVoidCountMap[]
): CombinedVoidCountMap {
  const merged: CombinedVoidCountMap = {};

  maps.forEach((map) => {
    Object.entries(map).forEach(([orderIdStr, entries]) => {
      const orderId = Number(orderIdStr);
      if (!Number.isFinite(orderId)) return;

      if (!merged[orderId]) {
        merged[orderId] = {};
      }

      Object.entries(entries).forEach(([key, count]) => {
        const numericCount = Number(count ?? 0);
        if (!Number.isFinite(numericCount) || numericCount <= 0) return;

        merged[orderId][key] = Math.max(merged[orderId][key] ?? 0, numericCount);
      });
    });
  });

  return merged;
}

function consumeCombinedVoidMatch(
  map: CombinedVoidCountMap,
  currentOrderId: number,
  product: unknown,
  quantity: unknown,
): boolean {
  const key = getCombinedVoidKey(product, quantity);
  if (!key) return false;

  const candidateOrderIds = Object.keys(map)
    .map((orderId) => Number(orderId))
    .filter(
      (orderId) =>
        Number.isFinite(orderId) &&
        orderId < currentOrderId &&
        (map[orderId]?.[key] ?? 0) > 0,
    )
    .sort((a, b) => a - b);

  const sourceOrderId = candidateOrderIds[0];
  if (!Number.isFinite(sourceOrderId)) return false;

  map[sourceOrderId][key] = (map[sourceOrderId][key] ?? 0) - 1;

  if (map[sourceOrderId][key] <= 0) {
    delete map[sourceOrderId][key];
  }

  if (map[sourceOrderId] && Object.keys(map[sourceOrderId]).length === 0) {
    delete map[sourceOrderId];
  }

  return true;
}

function getAutoRefreshSeconds(): number {
  try {
    const raw = JSON.parse(localStorage.getItem("kds-time-settings") || "{}");
    const parsed = Number(raw?.autoRefresh);

    if (!Number.isFinite(parsed)) return 30;

    return Math.max(5, Math.floor(parsed));
  } catch {
    return 30;
  }
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [firstOrderId, setFirstOrderId] = useState<number | null>(null);
  const [savedStates, setSavedStates] = useState<
    Record<number, Record<number, { status: string; itemName?: string; modifiers?: string[]; note?: string; quantity?: number; orderDateTime?: string }>>
  >({});
  // Cargar servedTransactionIds y servedOrderIds desde localStorage
  // para que sobrevivan entre refreshes del navegador
  const [servedTransactionIds, setServedTransactionIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('kds-served-transaction-ids');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed);
        }
      }
    } catch {}
    return new Set();
  });
  const [servedOrderIds, setServedOrderIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('kds-served-order-ids');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed);
        }
      }
    } catch {}
    return new Set();
  });
  const [shownClosedOrderIds, setShownClosedOrderIds] = useState<Set<number>>(new Set());

  const previousOrdersRef = useRef<Order[]>([]);
  const anticipatedCombinedVoidsRef = useRef<CombinedVoidCountMap>({});
  const shownClosedOrderIdsRef = useRef(shownClosedOrderIds);
  shownClosedOrderIdsRef.current = shownClosedOrderIds;
  const isFetchingRef = useRef(false);
  const isMountedRef = useRef(true);

  // Persistir servedTransactionIds en localStorage cuando cambia
  const servedTransIdsRef = useRef(servedTransactionIds);
  servedTransIdsRef.current = servedTransactionIds;
  const servedOrderIdsRef = useRef(servedOrderIds);
  servedOrderIdsRef.current = servedOrderIds;

  useEffect(() => {
    try {
      // Limitar a los últimos 2000 IDs para no saturar localStorage
      const arr = [...servedTransactionIds];
      const limited = arr.length > 2000 ? arr.slice(-2000) : arr;
      localStorage.setItem('kds-served-transaction-ids', JSON.stringify(limited));
    } catch {}
  }, [servedTransactionIds]);

  useEffect(() => {
    try {
      const arr = [...servedOrderIds];
      const limited = arr.length > 500 ? arr.slice(-500) : arr;
      localStorage.setItem('kds-served-order-ids', JSON.stringify(limited));
    } catch {}
  }, [servedOrderIds]);

  // Limpiar cache al cambiar de día operacional
  useEffect(() => {
    try {
      const currentOpDate = getOperationalDate();
      const storedOpDate = localStorage.getItem('kds-served-operational-date');
      if (storedOpDate && storedOpDate !== currentOpDate) {
        console.log(`📅 Día operacional cambió (${storedOpDate} → ${currentOpDate}). Limpiando cache de servidos.`);
        localStorage.removeItem('kds-served-transaction-ids');
        localStorage.removeItem('kds-served-order-ids');
        setServedTransactionIds(new Set());
        setServedOrderIds(new Set());
      }
      localStorage.setItem('kds-served-operational-date', currentOpDate);
    } catch {}
  }, []);

  // Función de respaldo para sonido de notificación (debe estar antes)
  const fallbackNotificationSound = useCallback(() => {
    try {
      const settings = localStorage.getItem("kds-display-settings");
      const soundEnabled = settings ? JSON.parse(settings).soundAlert : true;

      if (soundEnabled && window.AudioContext) {
        const audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = "sine";

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          audioContext.currentTime + 0.5
        );

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      }
    } catch (error) {
      console.log("Error en fallbackNotificationSound:", error);
    }
  }, []);

  const playNotificationSound = useCallback(() => {
    try {
      const settings = localStorage.getItem("kds-display-settings");
      const soundEnabled = settings ? JSON.parse(settings).soundAlert : true;

      if (soundEnabled) {
        const audio = new Audio("/notification-sound.mp3");
        audio.volume = 0.3;
        audio.play().catch((error) => {
          console.log("Error reproduciendo sonido:", error);
          fallbackNotificationSound();
        });
      } else {
        console.log("Sonido desactivado en configuración");
      }
    } catch (error) {
      console.log("Error en playNotificationSound:", error);
      fallbackNotificationSound();
    }
  }, [fallbackNotificationSound]);

  // Función para detectar nuevas órdenes y nuevas transacciones Y enviarlas al backend
  const processNewOrdersAndTransactions = useCallback(
    async (currentOrders: Order[], previousOrders: Order[]) => {
      let hasNewItems = false;

      // Detectar nuevas órdenes
      const currentOrderIds = new Set(
        currentOrders.map((order) => order.orderheaders.OrderID)
      );
      const previousOrderIds = new Set(
        previousOrders.map((order) => order.orderheaders.OrderID)
      );
      const newOrderIds = [...currentOrderIds].filter(
        (id) => !previousOrderIds.has(id)
      );

      if (newOrderIds.length > 0) {
        console.log(`Nuevas órdenes detectadas: ${newOrderIds.join(", ")}`);

        // Enviar nuevas órdenes al backend
        const newOrders = currentOrders.filter((o) =>
          newOrderIds.includes(o.orderheaders.OrderID)
        );

        // Solo hacer sonar la alerta si la orden tiene ítems NO combinados
        const hasVisibleItems = newOrders.some(o => 
          o.ordertransactions.some(t => !t.Combined)
        );
        if (hasVisibleItems) {
          hasNewItems = true;
        }

        for (const order of newOrders) {
          await postKDSOrder(order, order.orderheaders.Turn, "PREPARING").catch(
            (err) =>
              console.error(
                `Error enviando nueva orden ${order.orderheaders.OrderID}:`,
                err
              )
          );
        }
      }

      // Detectar nuevas transacciones en órdenes existentes
      const previousOrdersMap = new Map(
        previousOrders.map((order) => [order.orderheaders.OrderID, order])
      );

      for (const currentOrder of currentOrders) {
        // Si es orden nueva, ya se procesó completa arriba, saltar
        if (newOrderIds.includes(currentOrder.orderheaders.OrderID)) continue;

        const previousOrder = previousOrdersMap.get(
          currentOrder.orderheaders.OrderID
        );

        if (previousOrder) {
          const currentTransactionIds = new Set(
            currentOrder.ordertransactions.map((t) => t.OrderTransactionID)
          );
          const previousTransactionIds = new Set(
            previousOrder.ordertransactions.map((t) => t.OrderTransactionID)
          );

          const newTransactionIds = [...currentTransactionIds].filter(
            (id) => !previousTransactionIds.has(id)
          );

          if (newTransactionIds.length > 0) {
            console.log(
              `Nuevas transacciones en orden ${currentOrder.orderheaders.OrderID}: ${newTransactionIds.join(", ")}`
            );

            // Solo mostrar alerta si hay transacciones nuevas visibles
            const visibleNewTrans = currentOrder.ordertransactions.filter(
              t => newTransactionIds.includes(t.OrderTransactionID) && !t.Combined
            );
            if (visibleNewTrans.length > 0) {
              hasNewItems = true;
            }

            // Enviar nuevas transacciones individualmente
            for (const transId of newTransactionIds) {
              await postKDSOrder(
                currentOrder,
                currentOrder.orderheaders.Turn,
                "PREPARING",
                transId
              ).catch((err) =>
                console.error(
                  `Error enviando nueva transacción ${transId}:`,
                  err
                )
              );
            }
          }
        }
      }

      return hasNewItems;
    },
    []
  );

  useEffect(() => {
    if (orders.length > 0 && previousOrdersRef.current.length > 0) {
      processNewOrdersAndTransactions(
        orders,
        previousOrdersRef.current
      ).then((hasNewItems) => {
        if (hasNewItems) {
          playNotificationSound();
        }
      });
    }

    previousOrdersRef.current = orders;
  }, [orders, playNotificationSound, processNewOrdersAndTransactions]);

  const groupByOrder = useCallback(
    async (
      data: any[],
      firstOrderId: number | null,
      servedTransIds: Set<number>,
      prevOrders: Order[] = [],
      savedStatesData: Record<number, Record<number, { status: string; itemName?: string; modifiers?: string[]; note?: string; quantity?: number; menuItemNotification?: string; orderDateTime?: string; combined?: boolean }>> = {},
      combinedVoidMap: CombinedVoidCountMap = {}
    ) => {
      // Leer configuracion usaHoraKDS
      let usaHoraKDS = false;
      try {
        const settings = localStorage.getItem('kds-display-settings');
        if (settings) {
          usaHoraKDS = JSON.parse(settings).usaHoraKDS === true;
        }
      } catch (e) {
        console.error("Error reading usaHoraKDS:", e);
      }

      // Iniciar con la data del API
      const safeData = Array.isArray(data)
        ? [...data].sort((a: any, b: any) => {
            const orderDiff = Number(a?.OrderID ?? 0) - Number(b?.OrderID ?? 0);
            if (orderDiff !== 0) return orderDiff;

            return Number(a?.OrderTransactionID ?? 0) - Number(b?.OrderTransactionID ?? 0);
          })
        : [];

      const grouped: Record<number, any> = {};
      const ignoredTransactionIds = new Set<number>();

      const pendingCombinedVoidMap = cloneCombinedVoidCountMap(combinedVoidMap);

      for (const item of safeData) {
        // Filtrar transacciones con LastRowHash NO nulo (AW y otros)
        if (item.LastRowHash != null) {
          ignoredTransactionIds.add(item.OrderTransactionID);
          continue;
        }

        const orderId = item.OrderID;
        if (!grouped[orderId]) {
          grouped[orderId] = {
            orderheaders: {
              OrderID: orderId,
              EmployeeName: item.EmployeeName,
              OrderDateTime: item.OrderDateTime,
              OrderStatus: item.OrderStatus,
              OrderType: item.OrderType,
              CustomerName: item.CustomerName,
              DineInTableText: item.DineInTableText,
              SpecificCustomerName: item.SpecificCustomerName,
              Turn:
                firstOrderId !== null
                  ? getDailyOrderNumber(orderId, firstOrderId)
                  : null,
            },
            ordertransactions: [],
          };
        }

        // Determinar si hay void para este item
        const isCombined = consumeCombinedVoidMatch(
          pendingCombinedVoidMap,
          orderId,
          item.MenuItemText,
          item.Quantity,
        );

        grouped[orderId].ordertransactions.push({
          OrderTransactionID: item.OrderTransactionID,
          MenuItemText: item.MenuItemText,
          Quantity: parseFloat(item.Quantity.toFixed(3)),
          MenuItemUnitPrice: item.MenuItemUnitPrice,
          ExtendedPrice: item.ExtendedPrice,
          MenuItemNotification: resolveMenuItemNotification(item),
          TransactionStatus: item.TransactionStatus,
          Status: "PREPARING", // Omitimos el Status original hasta resolver el bloque final
          ShortNote: item.ShortNote,
          ScriptDetails: item.ScriptDetails,
          LastRowHash: item.LastRowHash, // Guardamos para referencia futura
          modifiers: Array.from({ length: 20 })
            .map((_, i) => item[`Mod${i + 1}Text`])
            .filter(Boolean),
          Combined: isCombined,
        });
      }

      // 1. Recuperar transacciones desde SavedStates.
      //    Ahora también creamos órdenes "huérfanas" cuando aparecen en KDS DB
      //    pero no en el endpoint principal /ordenespordia. De esta manera seguiremos
      //    mostrando los items aunque no existan en la respuesta del POS y la
      //    información se mantendrá tras recargar la página.
      Object.entries(savedStatesData).forEach(([orderIdStr, transactions]) => {
        const orderId = parseInt(orderIdStr);
        let existingOrder = grouped[orderId];

        // Si la orden no está en los datos del POS, creamos una estructura mínima
        // (intentando reutilizar la información previa si existe en prevOrders).
        if (!existingOrder) {
          const prev = prevOrders.find(o => o.orderheaders.OrderID === orderId);
          if (prev) {
            // clonamos para no mutar el original
            existingOrder = JSON.parse(JSON.stringify(prev));
          } else {
            existingOrder = {
              orderheaders: {
                OrderID: orderId,
                EmployeeName: '',
                OrderDateTime: '',
                OrderStatus: '',
                OrderType: '',
                CustomerName: '',
                DineInTableText: '',
                SpecificCustomerName: '',
                Turn:
                  firstOrderId !== null
                    ? getDailyOrderNumber(orderId, firstOrderId)
                    : null,
              },
              ordertransactions: [],
            };
          }
          grouped[orderId] = existingOrder;
        }

        if (existingOrder) {
          const loadedTransIds = new Set(existingOrder.ordertransactions.map((t: any) => t.OrderTransactionID));

          Object.entries(transactions).forEach(([transIdStr, details]) => {
            const transId = parseInt(transIdStr);

            // Si ya está cargada, actualizamos el estado y otros campos si es necesario (para que coincida con DB)
            if (loadedTransIds.has(transId)) {
              const paramTrans = existingOrder.ordertransactions.find((t: any) => t.OrderTransactionID === transId);
              if (paramTrans) {
                // Actualizar status
                if (paramTrans.Status !== details.status) {
                  paramTrans.Status = details.status;
                }
                // Actualizar otros campos si están disponibles en savedStates
                if (details.itemName && !paramTrans.MenuItemText) {
                  paramTrans.MenuItemText = details.itemName;
                }
                if (details.modifiers && details.modifiers.length > 0) {
                  // Fusionar modificadores sin duplicados
                  const existingModifiers = paramTrans.modifiers || [];
                  const combinedModifiers = [...new Set([...existingModifiers, ...details.modifiers])];
                  paramTrans.modifiers = combinedModifiers;
                }
                if (details.note && !paramTrans.ShortNote) {
                  paramTrans.ShortNote = details.note;
                }
                if (details.quantity && paramTrans.Quantity === 1) {
                  paramTrans.Quantity = details.quantity;
                }
                if (details.combined) {
                  paramTrans.Combined = true;
                }
              }
              return;
            }

            // Si NO está cargada y NO fue ignorada...
            if (!ignoredTransactionIds.has(transId)) {
              // Buscamos si tenemos una versión "rica" en memoria (prevOrders)
              let richTransaction = null;
              if (prevOrders) {
                const oldOrder = prevOrders.find(o => o.orderheaders.OrderID === orderId);
                if (oldOrder) {
                  richTransaction = oldOrder.ordertransactions.find(t => t.OrderTransactionID === transId);
                }
              }

              // Construcción del item
              const finalItemName = richTransaction?.MenuItemText || details.itemName || "⚠️ Producto Desconocido";

              if (!richTransaction && !details.itemName) {
                console.log(`⚠️ Recuperando transacción ${transId} sin nombre ni memoria. ID Orden: ${orderId}`);
              }

              existingOrder.ordertransactions.push({
                OrderTransactionID: transId,
                MenuItemText: finalItemName,
                Quantity: richTransaction?.Quantity || details.quantity || 1,
                MenuItemUnitPrice: richTransaction?.MenuItemUnitPrice || 0,
                ExtendedPrice: richTransaction?.ExtendedPrice || 0,
                // si no tenemos información previa, usar la zona del KDS guardada o asumir "2"
                MenuItemNotification: richTransaction?.MenuItemNotification || details.menuItemNotification || '2',
                TransactionStatus: richTransaction?.TransactionStatus || '0',
                Status: details.status, // Usamos siempre el estado de KDS DB
                ShortNote: richTransaction?.ShortNote || details.note || '',
                LastRowHash: null,
                modifiers: richTransaction?.modifiers || details.modifiers || [],
                Combined: details.combined || false
              });
              loadedTransIds.add(transId);
            }
          });

          // Reordenar por ID
          existingOrder.ordertransactions.sort(
            (a: any, b: any) => a.OrderTransactionID - b.OrderTransactionID
          );
        }
      });

      // 2. Fusionar transacciones antiguas que ya no están en la respuesta (Preservar desde memoria local)
      if (prevOrders && prevOrders.length > 0) {
        prevOrders.forEach((prevOrder) => {
          // Si ya la reconstruimos arriba desde savedStates, newOrder ya existe.
          const newOrder = grouped[prevOrder.orderheaders.OrderID];

          if (newOrder) {
            const newTransIds = new Set(
              newOrder.ordertransactions.map((t: any) => t.OrderTransactionID)
            );

            prevOrder.ordertransactions.forEach((prevTrans) => {
              // Solo preservar si NO está en las nuevas Y NO fue ignorada explícitamente
              if (!newTransIds.has(prevTrans.OrderTransactionID) && !ignoredTransactionIds.has(prevTrans.OrderTransactionID)) {

                // Defensa adicional
                if (prevTrans.LastRowHash != null) {
                  return;
                }
                if (typeof prevTrans.MenuItemText === 'string' && (prevTrans.MenuItemText.includes('➗') || prevTrans.MenuItemText.includes('÷'))) {
                  return;
                }

                newOrder.ordertransactions.push(prevTrans);
              }
            });

            // Reordenar
            newOrder.ordertransactions.sort(
              (a: any, b: any) => a.OrderTransactionID - b.OrderTransactionID
            );
          } else {
            // Si la orden entera desapareció del API y NO estaba en savedStates (o no teniamos data),
            // pero la teníamos en memoria... ¿la mantenemos?
            // Si tiene items pendientes, SI.
            const hasPending = prevOrder.ordertransactions.some(t => !servedTransIds.has(t.OrderTransactionID));
            if (hasPending) {
              grouped[prevOrder.orderheaders.OrderID] = prevOrder;
            }
          }
        });
      }

      const statusMap: Record<number, string> = {};

      if (prevOrders && prevOrders.length > 0) {
        prevOrders.forEach((order) => {
          order.ordertransactions.forEach((transaction) => {
            if (transaction?.OrderTransactionID && transaction?.Status) {
              statusMap[transaction.OrderTransactionID] = transaction.Status;
            }
          });
        });
      }

      Object.values(savedStatesData).forEach((orderTransactions) => {
        Object.entries(orderTransactions).forEach(([transIdStr, details]) => {
          const transId = Number(transIdStr);
          if (Number.isFinite(transId)) {
            statusMap[transId] = details.status || "PREPARING";
          }
        });
      });

      Object.values(grouped).forEach((order: any) => {
        order.ordertransactions = order.ordertransactions.map((t: any) => {
          // Verificar primero si está en el conjunto local de servidos
          if (servedTransIds.has(t.OrderTransactionID)) {
  
  return {
              ...t,
              Status: "FINISHED",
            };
          }

          // Si está en savedStates, usar ese estado (prioridad)
          const saved = savedStatesData[order.orderheaders.OrderID]?.[t.OrderTransactionID];
          if (saved) {
            return {
              ...t,
              Status: saved.status
            };
          }

          // Si no, usar el estado del backend o mantener el actual
          return {
            ...t,
            Status: statusMap[t.OrderTransactionID] || t.Status || "PREPARING",
          };
        });
      });

      // Filtrar órdenes que solo contienen transacciones previamente servidas
      // PERO solo aplicar este filtro a órdenes que están completamente en PREPARING
      // Las órdenes con items FINISHED deben mostrarse siempre (ya fueron servidas por el usuario)
      const filteredOrders = Object.values(grouped).filter((order: any) => {
        // Verificar si la orden tiene algún item ya marcado como FINISHED
        const hasFinishedItems = order.ordertransactions.some((t: any) => t.Status === "FINISHED");

        // Si la orden tiene items FINISHED, siempre mostrarla (el usuario ya la sirvió)
        if (hasFinishedItems) {
          return true;
        }

        // Si la orden solo tiene items en PREPARING, verificar si tiene transacciones nuevas
        // Solo mostrar si tiene al menos una transacción que NO fue servida previamente
        const hasNewTransaction = order.ordertransactions.some(
          (t: any) => !servedTransIds.has(t.OrderTransactionID)
        );
        return hasNewTransaction;
      });

      // Procesar fechas y aplicar fallback mutuo (ordeneskds <-> ordenespordia)
      filteredOrders.forEach((order: any) => {
        const posDate = order.orderheaders.OrderDateTime;
        let kdsDate = "";

        // Buscar si existe fecha en KDS (savedStatesData)
        if (savedStatesData) {
          const kdsOrder = savedStatesData[order.orderheaders.OrderID];
          if (kdsOrder) {
            const firstTrans = Object.values(kdsOrder)[0] as any;
            if (firstTrans && firstTrans.orderDateTime) {
              kdsDate = firstTrans.orderDateTime;
            }
          }
        }

        // Función para validar si una fecha es parseable
        const isValidDate = (d: string) => {
          if (!d) return false;
          const testDate = new Date(d.replace("GMT", "").trim());
          return !isNaN(testDate.getTime());
        };

        const isPosValid = isValidDate(posDate);
        const isKdsValid = isValidDate(kdsDate);

        if (usaHoraKDS) {
          // Preferir KDS, fallback a POS
          if (isKdsValid) {
            order.orderheaders.OrderDateTime = kdsDate;
          } else if (!isPosValid && kdsDate) {
             // Si ninguna parece válidad como objeto local (como un string raro guardado literal), igual pasarlo si POS tampoco sirve
             order.orderheaders.OrderDateTime = kdsDate;
          }
        } else {
          // Preferir POS, fallback a KDS
          if (!isPosValid && isKdsValid) {
            order.orderheaders.OrderDateTime = kdsDate;
          } else if (!isPosValid && kdsDate) {
            order.orderheaders.OrderDateTime = kdsDate;
          }
        }
      });

      return {
        orders: filteredOrders.sort(
          (a: any, b: any) => a.orderheaders.OrderID - b.orderheaders.OrderID
        ),
        remainingCombinedVoidMap: pendingCombinedVoidMap,
      };
    },
    []
  );

  const toggleItemStatus = useCallback(
    (orderId: number, transId: number, status: string) => {
      const targetOrder = orders.find((o) => o.orderheaders.OrderID === orderId);
      if (!targetOrder) return;

      const newStatus = status === "PREPARING" ? "FINISHED" : "PREPARING";
      const updatedTransactions = targetOrder.ordertransactions.map((t) =>
        t.OrderTransactionID === transId ? { ...t, Status: newStatus } : t
      );
      const orderServedAfterUpdate = updatedTransactions.every(
        (t) => t.Status === "FINISHED"
      );

      setServedTransactionIds((prev) => {
        const newSet = new Set(prev);
        if (newStatus === "FINISHED") {
          newSet.add(transId);
        } else {
          newSet.delete(transId);
        }
        return newSet;
      });

      const targetTransaction = targetOrder.ordertransactions.find(
        (t) => t.OrderTransactionID === transId
      );

      if (targetTransaction) {
        putKDSOrdersBulk([{
          OrderTransactionID: transId,
          Status: newStatus,
          OrderID: orderId,
          Quantity: targetTransaction.Quantity,
          ItemName: targetTransaction.MenuItemText,
          Modifiers: targetTransaction.modifiers,
          Note: targetTransaction.ShortNote,
          MenuItemNotification: targetTransaction.MenuItemNotification,
          Combined: targetTransaction.Combined,
        }]).catch((error) => {
          console.error("Error actualizando ítem en KDS:", error);
        });
      }

      putOrderServed(
        orderId,
        orderServedAfterUpdate,
        updatedTransactions.map((t) => ({
          OrderTransactionID: t.OrderTransactionID,
          Status: t.Status as "PREPARING" | "FINISHED",
          Quantity: t.Quantity,
          MenuItemNotification: t.MenuItemNotification,
        }))
      ).catch((error) => {
        console.error("Error sincronizando OrderServed al cambiar ítem:", error);
      });

      setOrders((prev) =>
        prev.map((o) =>
          o.orderheaders.OrderID !== orderId
            ? o
            : {
                ...o,
                ordertransactions: o.ordertransactions.map((t) =>
                  t.OrderTransactionID === transId
                    ? { ...t, Status: newStatus }
                    : t
                ),
              }
        )
      );
    },
    [orders]
  );

  const syncOrderTransactionsOneByOne = useCallback(async (
    transactions: {
      OrderTransactionID: number;
      Status: "PREPARING" | "FINISHED";
      OrderID: number;
      Quantity: number;
      ItemName?: string;
      Modifiers?: string[];
      Note?: string;
      MenuItemNotification?: string;
      Combined?: boolean;
    }[]
  ) => {
    for (const transaction of transactions) {
      await putKDSOrdersBulk([transaction]);
    }
  }, []);

  const servirTodo = useCallback(async (order: Order): Promise<{ error?: string }> => {
    try {
      await putServeAllOrder(order);
    } catch (error: any) {
      console.error("Error al servir orden:", error);
      return { error: error?.message || 'Error desconocido al servir la orden' };
    }

    setServedTransactionIds((prev) => {
      const newSet = new Set(prev);
      order.ordertransactions.forEach((t) => {
        newSet.add(t.OrderTransactionID);
      });
      return newSet;
    });

    setServedOrderIds((prev) => {
      const newSet = new Set(prev);
      newSet.add(order.orderheaders.OrderID);
      return newSet;
    });

    setOrders((prev) =>
      prev.map((o) =>
        o.orderheaders.OrderID === order.orderheaders.OrderID
          ? {
            ...o,
            ordertransactions: o.ordertransactions.map((t) => ({
              ...t,
              Status: "FINISHED",
            })),
          }
          : o
      )
    );

    return {};
  }, []);

  const reabrirTodo = useCallback(async (order: Order) => {
    // Construir payload con todas las transacciones de esta orden
    const payload = order.ordertransactions.map((t) => ({
      OrderTransactionID: t.OrderTransactionID,
      Status: "PREPARING" as const,
      OrderID: order.orderheaders.OrderID,
      Quantity: t.Quantity,
      ItemName: t.MenuItemText,
      Modifiers: t.modifiers,
      Note: t.ShortNote,
      MenuItemNotification: t.MenuItemNotification,
      Combined: t.Combined
    }));

    try {
      // Enviar uno a uno para evitar inconsistencias del bulk en backends con Access
      await syncOrderTransactionsOneByOne(payload);

      // Siempre enviar PUT al reabrir (la orden ya exist?a)
      await putOrderServed(
        order.orderheaders.OrderID,
        false,
        payload.map((t) => ({
          OrderTransactionID: t.OrderTransactionID,
          Status: t.Status,
          Quantity: t.Quantity,
          MenuItemNotification: t.MenuItemNotification,
        }))
      );
    } catch (error) {
      console.error("Error al actualizar orden en reabrirTodo:", error);
    }

    setServedTransactionIds((prev) => {
      const newSet = new Set(prev);
      order.ordertransactions.forEach((t) => {
        newSet.delete(t.OrderTransactionID);
      });
      return newSet;
    });

    // Desmarcar la orden como servida
    setServedOrderIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(order.orderheaders.OrderID);
      return newSet;
    });

    setOrders((prev) =>
      prev.map((o) =>
        o.orderheaders.OrderID === order.orderheaders.OrderID
          ? {
            ...o,
            ordertransactions: o.ordertransactions.map((t) => ({
              ...t,
              Status: "PREPARING",
            })),
          }
          : o
      )
    );
  }, [syncOrderTransactionsOneByOne]);

  const getTransactionModifiers = useCallback((trans: any): string[] => {
    return trans.modifiers || [];
  }, []);

  const filterQueueOrders = useCallback((groupedData: any[]) => {
    const currentShownClosed = shownClosedOrderIdsRef.current;
    const newlyShownClosedIds: number[] = [];

    const filteredOrders = groupedData.filter((order: any) => {
      const orderStatus = String(order.orderheaders?.OrderStatus ?? "");
      const orderId = Number(order.orderheaders?.OrderID);

      if (orderStatus === "2") {
        if (currentShownClosed.has(orderId)) {
          return false;
        }

        if (Number.isFinite(orderId)) {
          newlyShownClosedIds.push(orderId);
        }

        return true;
      }

      return orderStatus === "1";
    });

    if (newlyShownClosedIds.length > 0) {
      setShownClosedOrderIds((prev) => {
        const next = new Set(prev);
        let changed = false;

        newlyShownClosedIds.forEach((orderId) => {
          if (!next.has(orderId)) {
            next.add(orderId);
            changed = true;
          }
        });

        return changed ? next : prev;
      });
    }

    return filteredOrders;
  }, []);

  const loadOrders = useCallback(async () => {
    if (isFetchingRef.current) {
      console.log("⏭️ Omitiendo refresh KDS: ya hay una carga en progreso.");
      return;
    }

    isFetchingRef.current = true;

    try {
      if (isMountedRef.current) {
        setRefreshing(true);
      }

      const fetchedVoidsByOrder = await fetchVoidsByOrder();
      const combinedVoidMap = mergeCombinedVoidCountMaps(
        anticipatedCombinedVoidsRef.current,
        buildCombinedVoidCountMap(fetchedVoidsByOrder),
      );

      const operationalDate = getOperationalDate();
      const groupedData = await fetchOrdersFromQueue();

      if (!Array.isArray(groupedData)) return;

      const filteredOrders = filterQueueOrders(groupedData);
      const openOrderIds = [...new Set(
        filteredOrders
          .filter((order: any) => String(order.orderheaders?.OrderStatus ?? "") === "1")
          .map((order: any) => order.orderheaders?.OrderID)
      )];

      const [states, firstId] = await Promise.all([
        fetchSavedKDSStates(operationalDate, openOrderIds),
        fetchFirstOrderId(),
      ]);

      if (!isMountedRef.current) return;

      setSavedStates(states);
      setFirstOrderId(firstId);

      const backendFinishedIds = new Set<number>();
      const backendPreparingIds = new Set<number>();
      Object.values(states).forEach((orderTransactions) => {
        Object.entries(orderTransactions).forEach(([transIdStr, details]) => {
          const transId = parseInt(transIdStr);
          if (details.status === "FINISHED") {
            backendFinishedIds.add(transId);
          } else {
            backendPreparingIds.add(transId);
          }
        });
      });

      setServedTransactionIds((prev) => {
        const merged = new Set(prev);
        backendFinishedIds.forEach((id) => merged.add(id));
        backendPreparingIds.forEach((id) => merged.delete(id));
        return merged;
      });

      const flatData: any[] = [];
      filteredOrders.forEach((order: any) => {
        const headers = order.orderheaders || {};
        const transactions = order.ordertransactions || [];

        transactions.forEach((trans: any) => {
          flatData.push({
            ...trans,
            OrderID: headers.OrderID,
            EmployeeName: headers.EmployeeName,
            OrderDateTime: headers.OrderDateTime,
            OrderStatus: headers.OrderStatus,
            OrderType: headers.OrderType,
            CustomerName: headers.CustomerName,
            DineInTableText: headers.DineInTableText,
            SpecificCustomerName: headers.SpecificCustomerName,
            MenuItemNotification: resolveMenuItemNotification(trans),
          });
        });
      });

      const currentServedRef = new Set(backendFinishedIds);
      previousOrdersRef.current.forEach((order) => {
        order.ordertransactions.forEach((t) => {
          if (t.Status === "FINISHED") {
            currentServedRef.add(t.OrderTransactionID);
          }
        });
      });
      servedTransIdsRef.current.forEach((id) => currentServedRef.add(id));
      backendPreparingIds.forEach((id) => currentServedRef.delete(id));

      const {
        orders: grouped,
        remainingCombinedVoidMap,
      } = await groupByOrder(
        flatData,
        firstId,
        currentServedRef,
        previousOrdersRef.current,
        states,
        combinedVoidMap,
      );

      anticipatedCombinedVoidsRef.current = remainingCombinedVoidMap;

      if (isMountedRef.current) {
        setOrders(grouped);
      }
    } catch (err) {
      console.error("❌ Error al cargar órdenes", err);
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [filterQueueOrders, groupByOrder]);

  useEffect(() => {
    isMountedRef.current = true;

    void loadOrders();
    const refreshInterval = getAutoRefreshSeconds() * 1000;
    const interval = setInterval(() => {
      void loadOrders();
    }, refreshInterval);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [loadOrders]);

  return {
    orders,
    loading,
    refreshing,
    refreshOrders: loadOrders,
    toggleItemStatus,
    servirTodo,
    reabrirTodo,
    getTransactionModifiers,
    playNotificationSound,
  };
}
