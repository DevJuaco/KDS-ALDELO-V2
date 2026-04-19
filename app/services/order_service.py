import logging
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable
from app.models.order import Order, OrderStatus
from app.repositories.order_repository import OrderRepository

class OrderService:
    def __init__(self, repository: OrderRepository):
        self.repository = repository
        self._cache: Dict[int, Order] = {}
        self._cache_lock = threading.Lock()
        self._last_sync = datetime.now() - timedelta(minutes=5) # Start with a small window
        self._stop_event = threading.Event()
        self._on_event_cb: Optional[Callable[[str, Order], None]] = None
        
        # Valid state transitions
        self._valid_transitions = {
            OrderStatus.CREATED: [OrderStatus.IN_PROGRESS],
            OrderStatus.IN_PROGRESS: [OrderStatus.READY],
            OrderStatus.READY: [OrderStatus.DELIVERED],
            OrderStatus.DELIVERED: []
        }

    def set_event_callback(self, cb: Callable[[str, Order], None]):
        self._on_event_cb = cb

    def start_polling(self, interval: float = 2.5):
        """Starts the background polling thread"""
        self._initialize_cache()
        self._polling_thread = threading.Thread(target=self._poll_loop, args=(interval,), daemon=True)
        self._polling_thread.start()
        logging.info("KDS Polling Service started.")

    def stop_polling(self):
        self._stop_event.set()
        if hasattr(self, '_polling_thread'):
            self._polling_thread.join()

    def _initialize_cache(self):
        """Initial load of active orders"""
        logging.info("Initializing KDS cache...")
        active_orders = self.repository.get_active_orders()
        with self._cache_lock:
            for order in active_orders:
                self._cache[order.order_id] = order
        logging.info(f"Cache initialized with {len(active_orders)} orders.")

    def _poll_loop(self, interval: float):
        while not self._stop_event.is_set():
            try:
                new_sync_time = datetime.now()
                modified_orders = self.repository.get_orders_modified_since(self._last_sync)
                
                for order in modified_orders:
                    self._update_order_in_cache(order)
                
                self._last_sync = new_sync_time
            except Exception as e:
                logging.error(f"Error in poll loop: {e}")
            
            time.sleep(interval)

    def _update_order_in_cache(self, order: Order):
        with self._cache_lock:
            exists = order.order_id in self._cache
            if not exists:
                # Detect New Order
                self._cache[order.order_id] = order
                self._emit("order_created", order)
            else:
                # Detect Update (Only if something changed - EditTimestamp should handle this)
                # But KDS status might be managed locally, so we merge
                current = self._cache[order.order_id]
                # If Aldelo says it's closed but we haven't delivered it yet, we might want to keep it or mark it delivered
                if order.status == OrderStatus.DELIVERED and current.status != OrderStatus.DELIVERED:
                    current.status = OrderStatus.DELIVERED
                
                # Update other fields (items, total, etc.)
                # Preserve item statuses if they were already in the cache
                for new_item in order.items:
                    old_item = next((i for i in current.items if i.item_id == new_item.item_id), None)
                    if old_item:
                        new_item.status = old_item.status
                
                current.items = order.items
                current.total = order.total
                current.last_modified = order.last_modified
                
                self._emit("order_updated", current)

    def _emit(self, event: str, order: Order):
        if self._on_event_cb:
            self._on_event_cb(event, order)

    def get_all_active_orders(self) -> List[Order]:
        with self._cache_lock:
            # Return active orders (not delivered)
            return [o for o in self._cache.values() if o.status != OrderStatus.DELIVERED]

    def update_order_status(self, order_id: int, new_status_str: str) -> Optional[Order]:
        try:
            new_status = OrderStatus(new_status_str)
        except ValueError:
            raise ValueError(f"Invalid status: {new_status_str}")

        with self._cache_lock:
            if order_id not in self._cache:
                return None
            
            order = self._cache[order_id]
            
            # If moving to READY, mark all items as READY too
            if new_status == OrderStatus.READY:
                for item in order.items:
                    item.status = OrderStatus.READY
            
            # If moving from READY back to CREATED, mark all items as CREATED
            elif new_status == OrderStatus.CREATED and order.status == OrderStatus.READY:
                for item in order.items:
                    item.status = OrderStatus.CREATED

            order.status = new_status
            order.last_modified = datetime.now()
            
            self._emit("order_updated", order)
            return order

    def update_item_status(self, order_id: int, item_id: int, new_status_str: str) -> Optional[Order]:
        try:
            new_status = OrderStatus(new_status_str)
        except ValueError:
            raise ValueError(f"Invalid status: {new_status_str}")

        with self._cache_lock:
            if order_id not in self._cache:
                return None
            
            order = self._cache[order_id]
            item = next((i for i in order.items if i.item_id == item_id), None)
            
            if not item:
                return None
            
            item.status = new_status
            order.last_modified = datetime.now()

            # Logic: If all items are READY, the order becomes READY
            all_ready = all(i.status == OrderStatus.READY for i in order.items)
            if all_ready and order.status != OrderStatus.READY:
                order.status = OrderStatus.READY
            # If at least one item is READY but not all, it's IN_PROGRESS
            elif not all_ready and any(i.status == OrderStatus.READY for i in order.items):
                order.status = OrderStatus.IN_PROGRESS
            # If no items are READY, it's back to CREATED (unless it was explicitly moved to something else)
            elif all(i.status == OrderStatus.CREATED for i in order.items):
                 order.status = OrderStatus.CREATED

            self._emit("order_updated", order)
            return order
