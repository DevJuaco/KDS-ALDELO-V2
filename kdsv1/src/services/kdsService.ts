import type { KDSOrderPayload, Order } from "./../utils/types";

function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("kds-api-url") || "";
  }
  // Valor por defecto para SSR o build
  return import.meta.env.PUBLIC_KDS_API_URL;
}

// 🔹 Obtiene la fecha operativa actual en formato YYYYMMDD
export function getOperationalDate(): string {
  const now = new Date();
  const colombiaNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Bogota" }),
  );

  if (colombiaNow.getHours() < 3) {
    colombiaNow.setDate(colombiaNow.getDate() - 1);
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(colombiaNow).replace(/-/g, "");
}

// 🔹 Obtiene el ID mínimo de orden (primer pedido del día)
export async function fetchFirstOrderId(): Promise<number | null> {
  const API_BASE_URL = getApiBaseUrl();
  try {
    const res = await fetch(`${API_BASE_URL}/ordenminima`);
    const data = await res.json();
    return data?.minorderid ?? null;
  } catch (err) {
    console.error("Error al obtener orden mínima:", err);
    return null;
  }
}

// 🔹 Obtiene todas las órdenes del día desde el POS
export async function fetchOrdersByDate(
  operationalDate: string,
): Promise<any[]> {
  const API_BASE_URL = getApiBaseUrl();
  try {
    const res = await fetch(`${API_BASE_URL}/ordenespordia/${operationalDate}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Error al obtener órdenes del día:", err);
    return [];
  }
}

// 🔹 Obtiene las órdenes desde la cola del KDS (con watcher)
export async function fetchOrdersFromQueue(): Promise<any[]> {
  const API_BASE_URL = getApiBaseUrl();
  try {
    const res = await fetch(`${API_BASE_URL}/cola/kds`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Error al obtener órdenes de la cola KDS:", err);
    return [];
  }
}

// 🔹 Obtiene las cancelaciones (voids) de una orden
type CombinedVoidItem = {
  OrderID: number;
  Producto: string;
  Cantidad: number;
  [key: string]: unknown;
};

function normalizeCombinedVoidItem(item: any): CombinedVoidItem | null {
  const orderId = Number(
    item?.OrderID ??
      item?.orderId ??
      item?.OrdenID ??
      item?.ordenId ??
      item?.IdOrden ??
      item?.idOrden,
  );

  const product = String(
    item?.Producto ??
      item?.producto ??
      item?.MenuItemText ??
      item?.menuItemText ??
      item?.ItemName ??
      item?.itemName ??
      "",
  ).trim();

  const quantity = Number(
    item?.Cantidad ?? item?.cantidad ?? item?.Quantity ?? item?.quantity ?? 0,
  );

  if (!Number.isFinite(orderId) || !product) {
    return null;
  }

  return {
    ...item,
    OrderID: orderId,
    Producto: product,
    Cantidad: Number.isFinite(quantity) ? quantity : 0,
  };
}

export async function fetchVoidsByOrder(): Promise<Record<number, CombinedVoidItem[]>> {
  const API_BASE_URL = getApiBaseUrl();
  try {
    const res = await fetch(`${API_BASE_URL}/ordenes/voids`);
    if (!res.ok) return {};
    const data = await res.json();
    const voids: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.voids)
        ? data.voids
        : Array.isArray(data?.data)
          ? data.data
          : [];

    return voids.reduce((acc: Record<number, CombinedVoidItem[]>, item: any) => {
      const normalizedItem = normalizeCombinedVoidItem(item);

      if (!normalizedItem) {
        return acc;
      }

      if (!acc[normalizedItem.OrderID]) {
        acc[normalizedItem.OrderID] = [];
      }

      acc[normalizedItem.OrderID].push(normalizedItem);
      return acc;
    }, {});
  } catch (err) {
    console.error("Error al obtener voids combinados:", err);
    return {};
  }
}

// 🔹 Obtiene los estados guardados en el backend KDS (órdenes KDS)
export async function fetchSavedKDSStates(
  operationalDate: string,
  orderIds?: number[],
): Promise<
  Record<
    number,
    Record<
      number,
      {
        status: string;
        itemName?: string;
        modifiers?: string[];
        note?: string;
        quantity?: number;
        menuItemNotification?: string;
        orderDateTime?: string;
        combined?: boolean;
      }
    >
  >
> {
  const API_BASE_URL = getApiBaseUrl();
  try {
    // Límite de IDs por request para no exceder longitud máxima de URL
    const MAX_IDS_PER_REQUEST = 40;
    let allData: any[] = [];

    if (orderIds && orderIds.length > MAX_IDS_PER_REQUEST) {
      // Dividir en chunks y limitar concurrencia para no saturar el backend
      const chunks: number[][] = [];
      const MAX_CONCURRENT_CHUNKS = 2;
      for (let i = 0; i < orderIds.length; i += MAX_IDS_PER_REQUEST) {
        chunks.push(orderIds.slice(i, i + MAX_IDS_PER_REQUEST));
      }

      console.log(`?? fetchSavedKDSStates: ${orderIds.length} IDs divididos en ${chunks.length} chunks`);

      const results: any[][] = [];
      for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_CHUNKS) {
        const batch = chunks.slice(i, i + MAX_CONCURRENT_CHUNKS);
        const batchResults = await Promise.all(
          batch.map(async (chunk) => {
            try {
              const url = `${API_BASE_URL}/ordeneskds/${operationalDate}?orderids=${chunk.join(',')}`;
              const res = await fetch(url);
              if (!res.ok) return [];
              const data = await res.json();
              return Array.isArray(data) ? data : [];
            } catch {
              return [];
            }
          })
        );

        results.push(...batchResults);
      }

      allData = results.flat();
    } else if (orderIds && orderIds.length > 0) {
      const url = `${API_BASE_URL}/ordeneskds/${operationalDate}?orderids=${orderIds.join(',')}`;
      const res = await fetch(url);
      const data = await res.json();
      allData = Array.isArray(data) ? data : [];
    } else {
      const res = await fetch(`${API_BASE_URL}/ordeneskds/${operationalDate}`);
      const data = await res.json();
      allData = Array.isArray(data) ? data : [];
    }

    if (allData.length === 0) return {};

    const normalizeStatus = (rawStatus: any, orderServed = false) => {
      if (orderServed) return "FINISHED";

      const normalized = String(rawStatus ?? "")
        .trim()
        .toUpperCase();

      if (
        normalized === "FINISHED" ||
        normalized === "1" ||
        normalized === "TRUE" ||
        normalized === "SERVED" ||
        normalized === "COMPLETED"
      ) {
        return "FINISHED";
      }

      return "PREPARING";
    };

    const isTruthyFlag = (value: any) =>
      value === true ||
      value === 1 ||
      value === "1" ||
      value === "true" ||
      value === "TRUE";

    const normalizeTransaction = (
      trans: any,
      orderId: number,
      orderDateTime: string,
      orderServed: boolean,
    ) => {
      const transId = Number(
        trans?.OrderTransactionID ??
          trans?.orderTransactionId ??
          trans?.TransactionID,
      );

      if (!Number.isFinite(transId)) return null;

      return {
        transId,
        details: {
          status: normalizeStatus(trans?.Status ?? trans?.status, orderServed),
          itemName:
            trans?.ItemName ??
            trans?.itemName ??
            trans?.MenuItemText ??
            trans?.MenuItemName,
          modifiers: Array.isArray(trans?.Modifiers)
            ? trans.Modifiers
            : Array.isArray(trans?.modifiers)
              ? trans.modifiers
              : [],
          note: trans?.Note ?? trans?.note ?? trans?.ShortNote,
          quantity: Number(trans?.Quantity ?? trans?.quantity ?? 1) || 1,
          menuItemNotification:
            trans?.MenuItemNotification ?? trans?.menuItemNotification,
          orderDateTime,
          combined: isTruthyFlag(trans?.Combined ?? trans?.combined),
        },
      };
    };

    const map: Record<
      number,
      Record<
        number,
        {
          status: string;
          itemName?: string;
          modifiers?: string[];
          note?: string;
          quantity?: number;
          menuItemNotification?: string;
          orderDateTime?: string;
          combined?: boolean;
        }
      >
    > = {};
    allData.forEach((orderItem: any) => {
      const orderId = Number(orderItem?.OrderID ?? orderItem?.orderId);
      if (!Number.isFinite(orderId)) return;

      const orderDateTime =
        orderItem?.OrderDateTime ??
        orderItem?.OrderDatetime ??
        orderItem?.orderDateTime ??
        "";

      const orderServed = isTruthyFlag(
        orderItem?.OrderServed ?? orderItem?.orderServed,
      );

      const transactions = Array.isArray(orderItem?.Transactions)
        ? orderItem.Transactions
        : Array.isArray(orderItem?.OrderTransactions)
          ? orderItem.OrderTransactions
          : Array.isArray(orderItem?.transactions)
            ? orderItem.transactions
            : [];

      if (!map[orderId]) map[orderId] = {};

      if (transactions.length > 0) {
        transactions.forEach((trans: any) => {
          const normalized = normalizeTransaction(
            trans,
            orderId,
            orderDateTime,
            orderServed,
          );

          if (!normalized) return;

          map[orderId][normalized.transId] = normalized.details;
        });
        return;
      }

      const flatTransaction = normalizeTransaction(
        orderItem,
        orderId,
        orderDateTime,
        orderServed,
      );

      if (!flatTransaction) return;

      map[orderId][flatTransaction.transId] = flatTransaction.details;
    });

    return map;
  } catch (err) {
    console.error("Error al obtener estados KDS:", err);
    return {};
  }
}

// 🔹 Envía una transacción completa al backend KDS
export async function postKDSOrder(
  order: Order,
  turn: number | undefined,
  status: "PREPARING" | "FINISHED",
  transactionId?: number,
) {
  const payload = mapOrderForBackend(order, turn, status, transactionId);
  const API_BASE_URL = getApiBaseUrl();

  try {
    console.log("Body enviado a ordenkds:", payload);
    const res = await fetch(`${API_BASE_URL}/ordenkds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Intentar leer el cuerpo de la respuesta para ver el error
      let errorBody = "";
      try {
        errorBody = await res.text();
      } catch (e) {
        errorBody = "No se pudo leer el cuerpo de la respuesta";
      }

      console.error("❌ Error al enviar orden al KDS (POST):", {
        status: res.status,
        statusText: res.statusText,
        url: `${API_BASE_URL}/ordenkds`,
        payload: payload,
        responseBody: errorBody,
      });

      throw new Error(`Error HTTP ${res.status}: ${errorBody}`);
    }
    return await res.json();
  } catch (error) {
    console.error("❌ Error al enviar orden al KDS (POST):", error);
    throw error;
  }
}

// 🔹 Actualiza múltiples transacciones en el backend KDS (PUT Bulk)
// Si la orden no existe en la DB KDS (404), hace fallback a POST para crearla
export async function putKDSOrdersBulk(
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
  }[],
) {
  const API_BASE_URL = getApiBaseUrl();

  if (transactions.length === 0) return;

  const payload = transactions.length === 1 ? transactions[0] : transactions;

  console.log(
    "PUT /ordeneskds/update-multiple payload:",
    JSON.stringify(payload, null, 2),
  );

  try {
    const res = await fetch(`${API_BASE_URL}/ordeneskds/update-multiple`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 404) {
      // La orden no existe en la DB KDS → crear con POST
      console.warn(
        "⚠️ PUT /ordeneskds/update-multiple devolvió 404. Intentando POST como fallback...",
      );
      return await postKDSOrdersBulkFallback(transactions, API_BASE_URL);
    }

    if (!res.ok) {
      let errorBody = "";
      try {
        errorBody = await res.text();
      } catch (e) {
        errorBody = "No se pudo leer el cuerpo de la respuesta";
      }
      console.error("❌ Error al actualizar múltiples órdenes en KDS (PUT):", {
        status: res.status,
        statusText: res.statusText,
        url: `${API_BASE_URL}/ordeneskds/update-multiple`,
        responseBody: errorBody,
      });
      throw new Error(`Error HTTP ${res.status}: ${errorBody}`);
    }

    return await res.json();
  } catch (error) {
    console.error(
      "❌ Error al actualizar múltiples órdenes en KDS (PUT):",
      error,
    );
    throw error;
  }
}

// 🔹 Fallback interno: crea transacciones vía POST cuando el PUT retorna 404
// Agrupa por OrderID y usa la estructura correcta del endpoint POST /ordenkds
async function postKDSOrdersBulkFallback(
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
  }[],
  API_BASE_URL: string,
) {
  // Agrupar por OrderID → un POST por orden con todas sus transacciones
  const byOrder = new Map<number, typeof transactions>();
  for (const t of transactions) {
    if (!byOrder.has(t.OrderID)) byOrder.set(t.OrderID, []);
    byOrder.get(t.OrderID)!.push(t);
  }

  let usaHoraKDS = false;
  try {
    const settings = localStorage.getItem('kds-display-settings');
    if (settings) {
      usaHoraKDS = JSON.parse(settings).usaHoraKDS === true;
    }
  } catch (error) {}

  const results = [];
  for (const [orderId, orderTransactions] of byOrder) {
    const postPayload = {
      OrderID: orderId,
      ...(usaHoraKDS ? { TimeKDS: true } : {}),
      OrderTransactions: orderTransactions.map((t) => ({
        OrderTransactionID: t.OrderTransactionID,
        Status: t.Status,
        Quantity: t.Quantity,
        ItemName: t.ItemName,
        Modifiers: t.Modifiers,
        Note: t.Note,
        MenuItemNotification: t.MenuItemNotification, // Agregar zona del KDS
        ...(t.Combined ? { Combined: true } : {}),
      })),
    };
    console.log(
      `POST /ordenkds (fallback) OrderID ${orderId}:`,
      JSON.stringify(postPayload, null, 2),
    );
    const res = await fetch(`${API_BASE_URL}/ordenkds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postPayload),
    });
    if (!res.ok) {
      let errorBody = "";
      try {
        errorBody = await res.text();
      } catch (_) {}
      console.error(`❌ Error en POST fallback OrderID ${orderId}:`, {
        status: res.status,
        errorBody,
      });
    } else {
      results.push(await res.json());
    }
  }
  return results;
}

export async function getTransactionsStatusBulk(transactionIds: number[]) {
  if (!transactionIds || transactionIds.length === 0) return {};
  const API_BASE_URL = getApiBaseUrl();
  try {
    const query = transactionIds.join(",");
    const res = await fetch(`${API_BASE_URL}/ordenkds/status?ids=${query}`, {
      method: "GET",
    });

    if (res.status === 404) return {}; // Si no hay estados guardados aún, devolvemos vacío
    if (!res.ok) throw new Error("Error al obtener estados");

    const data = await res.json();

    const statusMap: Record<number, string> = {};
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item?.OrderTransactionID) {
          statusMap[item.OrderTransactionID] = item.Status || "PREPARING";
        }
      }
    }

    return statusMap;
  } catch (err) {
    console.error("❌ Error en getTransactionsStatusBulk", err);
    return transactionIds.reduce(
      (acc, id) => {
        acc[id] = "PREPARING";
        return acc;
      },
      {} as Record<number, string>,
    );
  }
}

// 🔹 Envía el estado de la orden servida/reabierta
// Si la orden no existe en la DB KDS (404), hace POST con OrderID + OrderTransactions + OrderServed
export async function putOrderServed(
  orderId: number,
  served: boolean,
  transactions?: {
    OrderTransactionID: number;
    Status: "PREPARING" | "FINISHED";
    Quantity: number;
    MenuItemNotification?: string;
  }[],
) {
  const API_BASE_URL = getApiBaseUrl();
  let usaHoraKDS = false;
  try {
    const settings = localStorage.getItem('kds-display-settings');
    if (settings) {
      usaHoraKDS = JSON.parse(settings).usaHoraKDS === true;
    }
  } catch (error) {}

  try {
    const payload = { OrderServed: served };
    console.log(
      `PUT /ordenkds/${orderId}/served payload:`,
      JSON.stringify(payload, null, 2),
    );

    const res = await fetch(`${API_BASE_URL}/ordenkds/${orderId}/served`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 404 && transactions && transactions.length > 0) {
      // La orden no existe en la DB KDS → POST con la estructura completa requerida
      console.warn(
        `⚠️ PUT /ordenkds/${orderId}/served devolvió 404. Intentando POST como fallback...`,
      );
      const postPayload = {
        OrderID: orderId,
        OrderServed: served,
        ...(usaHoraKDS ? { TimeKDS: true } : {}),
        OrderTransactions: transactions.map((t) => ({
          OrderTransactionID: t.OrderTransactionID,
          Status: t.Status,
          Quantity: t.Quantity,
          MenuItemNotification: t.MenuItemNotification,
        })),
      };
      console.log(
        `POST /ordenkds (served fallback) payload:`,
        JSON.stringify(postPayload, null, 2),
      );
      const postRes = await fetch(`${API_BASE_URL}/ordenkds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postPayload),
      });
      if (!postRes.ok) {
        let errorBody = "";
        try {
          errorBody = await postRes.text();
        } catch (_) {}
        throw new Error(
          `Error HTTP (POST fallback) ${postRes.status}: ${errorBody}`,
        );
      }
      return await postRes.json();
    }

    if (res.status === 404) {
      // 404 sin transacciones disponibles → omitir silenciosamente
      console.warn(
        `⚠️ PUT /ordenkds/${orderId}/served devolvió 404 y no hay transacciones para el fallback. Omitiendo.`,
      );
      return null;
    }

    if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("Error al actualizar estado OrderServed:", error);
    throw error;
  }
}

export async function putServeAllOrder(order: Order) {
  const API_BASE_URL = getApiBaseUrl();
  const orderId = order.orderheaders.OrderID;

  try {
    let res = await fetch(`${API_BASE_URL}/ordenkds/${orderId}/serve-all`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
    });

    if (res.status === 404) {
      console.warn(
        `⚠️ PUT /ordenkds/${orderId}/serve-all devolvió 404. Intentando POST y reintentando PUT...`,
      );

      await postKDSOrder(
        order,
        order.orderheaders.Turn,
        "FINISHED",
      );

      res = await fetch(`${API_BASE_URL}/ordenkds/${orderId}/serve-all`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!res.ok) {
      let errorBody = "";
      try {
        errorBody = await res.text();
      } catch (_) {}

      throw new Error(
        `Error HTTP ${res.status}${errorBody ? `: ${errorBody}` : ""}`,
      );
    }

    return await res.json();
  } catch (error) {
    console.error("Error al ejecutar serve-all:", error);
    throw error;
  }
}

function mapOrderForBackend(
  order: Order,
  turn: number | undefined,
  status: "PREPARING" | "FINISHED",
  transactionId?: number,
): KDSOrderPayload {
  const { orderheaders, ordertransactions } = order;

  const filteredTransactions = transactionId
    ? ordertransactions.filter((t) => t.OrderTransactionID === transactionId)
    : ordertransactions;

  let usaHoraKDS = false;
  try {
    const settings = localStorage.getItem('kds-display-settings');
    if (settings) {
      usaHoraKDS = JSON.parse(settings).usaHoraKDS === true;
    }
  } catch (error) {
    console.log('Error reading usaHoraKDS config', error);
  }

  // Formatear OrderDateTime a 'YYYY-MM-DD HH:mm:ss' agregando 5 horas
  let formattedDateTime = "";
  if (orderheaders.OrderDateTime) {
    try {
      const date = new Date(orderheaders.OrderDateTime);
      // Agregar 5 horas (5 * 60 * 60 * 1000 milliseconds)
      const dateWithOffset = new Date(date.getTime() + 5 * 60 * 60 * 1000);
      const year = dateWithOffset.getFullYear();
      const month = String(dateWithOffset.getMonth() + 1).padStart(2, "0");
      const day = String(dateWithOffset.getDate()).padStart(2, "0");
      const hours = String(dateWithOffset.getHours()).padStart(2, "0");
      const minutes = String(dateWithOffset.getMinutes()).padStart(2, "0");
      const seconds = String(dateWithOffset.getSeconds()).padStart(2, "0");
      formattedDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
      console.error("Error al formatear OrderDateTime:", error);
    }
  }

  // Determinar si la orden está completamente servida
  // Si NO se especifica transactionId, verificar si TODAS las transacciones están en FINISHED
  // Si se especifica transactionId, OrderServed depende del status que se está enviando
  // Determinar si la orden está completamente servida
  // Verificamos si TODAS las transacciones estarán en FINISHED después de esta actualización
  let orderServed: boolean;

  if (transactionId) {
    // Si actualizamos una transacción específica, verificamos todas las transacciones de la orden
    // simulando el cambio de estado en la transacción objetivo
    orderServed = ordertransactions.every((t) => {
      if (t.OrderTransactionID === transactionId) {
        return status === "FINISHED";
      }
      return t.Status === "FINISHED";
    });
  } else {
    // Si actualizamos todas (servir todo), verificamos si la acción es FINISHED
    // O si ya todas estaban finished (por robustez)
    if (status === "FINISHED") {
      orderServed = true;
    } else {
      // Si reabrimos todo, orderServed es false
      orderServed = false;
    }
  }

  const mapped: KDSOrderPayload = {
    OrderID: orderheaders.OrderID,
    Turn: turn,
    OrderDateTime: formattedDateTime || undefined,
    ...(usaHoraKDS ? { TimeKDS: true } : {}),
    OrderServed: orderServed,
    OrderTransactions: filteredTransactions.map((t) => ({
      Status: status,
      OrderID: orderheaders.OrderID,
      OrderTransactionID: t.OrderTransactionID,
      Quantity: t.Quantity,
      ItemName: t.MenuItemText,
      Modifiers: t.modifiers,
      Note: t.ShortNote,
      MenuItemNotification: t.MenuItemNotification, // Agregar zona del KDS
      ...(t.Combined ? { Combined: true } : {}),
    })),
  };

  return mapped;
}
