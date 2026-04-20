import pyodbc
import logging
from datetime import datetime
from typing import List, Optional
from app.models.order import Order, OrderStatus, OrderItem
from utils.database import dbconn

class OrderRepository:
    def __init__(self):
        self._last_sync = None

    def _row_to_order(self, row, columns) -> Order:
        row_dict = dict(zip(columns, row))
        
        # Mapping Aldelo status to KDS status
        # Aldelo: 1=Open, 2=Closed/Paid, 3=Voided
        # Initial KDS status
        aldelo_status = str(row_dict.get('OrderStatus', '1'))
        status = OrderStatus.CREATED if aldelo_status == '1' else OrderStatus.DELIVERED
        
        return Order(
            order_id=row_dict['OrderID'],
            status=status,
            order_type=row_dict.get('OrderType', 0),
            employee_name=row_dict.get('EmployeeName', 'Unknown'),
            customer_name=row_dict.get('CustomerName', '') or '',
            specific_customer_name=str(row_dict.get('SpecificCustomerName') or ''),
            dine_in_table_text=str(row_dict.get('DineInTableText') or ''),
            order_date=row_dict['OrderDateTime'],
            last_modified=row_dict.get('EditTimestamp', row_dict['OrderDateTime']),
            items=[],
            total=float(row_dict.get('AmountDue', 0.0))
        )

    def get_orders_modified_since(self, last_sync: datetime) -> List[Order]:
        """
        Fetch orders modified since last_sync using EditTimestamp
        """
        conn, cursor = dbconn()
        try:
            # Query only active or recently modified orders
            # Join with EmployeeFiles and CustomerFiles if needed
            query = """
                SELECT oh.*, e.FirstName & ' ' & e.LastName AS EmployeeName, cf.CustomerName
                FROM (OrderHeaders AS oh
                LEFT JOIN EmployeeFiles AS e ON oh.EmployeeID = e.EmployeeID)
                LEFT JOIN CustomerFiles AS cf ON oh.CustomerID = cf.CustomerID
                WHERE oh.EditTimestamp > ? OR oh.OrderDateTime > ?
            """
            cursor.execute(query, (last_sync, last_sync))
            rows = cursor.fetchall()
            columns = [col[0] for col in cursor.description]
            
            orders = []
            for row in rows:
                order = self._row_to_order(row, columns)
                # Fetch items for each modified order
                order.items = self.get_order_items(order.order_id)
                orders.append(order)
            
            return orders
        except Exception as e:
            logging.error(f"Error fetching modified orders: {e}")
            return []
        finally:
            conn.close()

    def get_order_items(self, order_id: int) -> List[OrderItem]:
        conn, cursor = dbconn()
        try:
            # Query including up to 20 modifiers using subqueries (Aldelo style)
            mod_queries = ", ".join([
                f"(SELECT MenuModifierText FROM MenuModifiers WHERE MenuModifierID = ot.Mod{i}ID) AS Mod{i}Text"
                for i in range(1, 21)
            ])
            
            query = f"""
                SELECT ot.*, mi.MenuItemText, mi.MenuItemNotification AS KitchenZone, {mod_queries}
                FROM OrderTransactions AS ot
                INNER JOIN MenuItems AS mi ON ot.MenuItemID = mi.MenuItemID
                WHERE ot.OrderID = ?
            """
            cursor.execute(query, (order_id,))
            rows = cursor.fetchall()
            columns = [col[0] for col in cursor.description]
            
            items = []
            for row in rows:
                d = dict(zip(columns, row))
                
                # Collect non-null modifiers
                modifiers = []
                for i in range(1, 21):
                    mod_text = d.get(f'Mod{i}Text')
                    if mod_text:
                        modifiers.append(str(mod_text).strip())
                
                items.append(OrderItem(
                    item_id=d['OrderTransactionID'],
                    name=d['MenuItemText'],
                    quantity=float(d.get('Quantity', 1)),
                    price=float(d.get('MenuItemUnitPrice', 0)),
                    status=OrderStatus.CREATED,
                    modifiers=modifiers,
                    transaction_status=str(d.get('TransactionStatus', '1') or '1'),
                    notification=str(
                        d.get('KitchenZone') or
                        d.get('MenuItemNotification') or
                        d.get('NotificationStatus') or
                        ''
                    ),
                    short_note=str(d.get('ShortNote', '') or ''),
                ))

            items.sort(key=lambda i: i.item_id)
            return items
        except Exception as e:
            logging.error(f"Error fetching order items for {order_id}: {e}")
            return []
        finally:
            conn.close()

    def _get_fiscal_day_start(self) -> datetime:
        """
        Calculates the start of the current fiscal day (rollover at 3 AM)
        """
        now = datetime.now()
        if now.hour < 3:
            # Shift started yesterday at 3 AM
            start = now.replace(hour=3, minute=0, second=0, microsecond=0)
            from datetime import timedelta
            return start - timedelta(days=1)
        else:
            # Shift started today at 3 AM
            return now.replace(hour=3, minute=0, second=0, microsecond=0)

    def get_active_orders(self) -> List[Order]:
        """
        Fetch all currently open orders for the current fiscal day to initialize cache
        """
        fiscal_start = self._get_fiscal_day_start()
        logging.info(f"Fetching active orders since fiscal day start: {fiscal_start}")
        
        conn, cursor = dbconn()
        try:
            query = """
                SELECT oh.*, e.FirstName & ' ' & e.LastName AS EmployeeName, cf.CustomerName
                FROM (OrderHeaders AS oh
                LEFT JOIN EmployeeFiles AS e ON oh.EmployeeID = e.EmployeeID)
                LEFT JOIN CustomerFiles AS cf ON oh.CustomerID = cf.CustomerID
                WHERE oh.OrderStatus = '1' AND oh.OrderDateTime >= ?
            """
            cursor.execute(query, (fiscal_start,))
            rows = cursor.fetchall()
            columns = [col[0] for col in cursor.description]
            
            orders = []
            for row in rows:
                order = self._row_to_order(row, columns)
                order.items = self.get_order_items(order.order_id)
                orders.append(order)
            return orders
        except Exception as e:
            logging.error(f"Error fetching active orders: {e}")
            return []
        finally:
            conn.close()
