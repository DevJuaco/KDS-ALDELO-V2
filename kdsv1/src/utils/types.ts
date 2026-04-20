export interface OrderTransaction {
  OrderTransactionID: number;
  MenuItemText: string;
  Quantity: number;
  MenuItemUnitPrice: number;
  ExtendedPrice: number;
  MenuItemNotification: string;
  TransactionStatus: string;
  Status: string;
  ShortNote?: string;
  LastRowHash?: string;
  modifiers: string[];
  Combined?: boolean;
}

export interface OrderHeader {
  OrderID: number;
  EmployeeName: string;
  OrderDateTime: string;
  OrderStatus: number;
  OrderType: string;
  Turn?: number;
  CustomerName?: string;
  DineInTableText?: string;
  SpecificCustomerName?: string;
}

export interface Order {
  orderheaders: OrderHeader;
  ordertransactions: OrderTransaction[];
}

export interface KDSOrderPayload {
  OrderID: number;
  Turn: number | undefined;
  OrderDateTime?: string;
  OrderServed?: boolean;
  OrderTransactions: KDSTransactionPayload[];
}

export interface KDSTransactionPayload {
  Status: "PREPARING" | "FINISHED";
  OrderID: number;
  OrderTransactionID: number;
  Quantity: number;
  ItemName?: string;
  Modifiers?: string[];
  Note?: string;
  MenuItemNotification?: string;
  Combined?: boolean;
}
