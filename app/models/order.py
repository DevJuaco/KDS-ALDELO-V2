from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Dict, Any

class OrderStatus(Enum):
    CREATED = "CREATED"
    IN_PROGRESS = "IN_PROGRESS"
    READY = "READY"
    DELIVERED = "DELIVERED"

@dataclass
class OrderItem:
    item_id: int
    name: str
    quantity: float
    price: float
    status: OrderStatus = OrderStatus.CREATED
    modifiers: List[str] = field(default_factory=list)
    transaction_status: str = "1"
    notification: str = "5"
    short_note: str = ""

@dataclass
class Order:
    order_id: int
    status: OrderStatus
    order_type: int
    employee_name: str
    customer_name: str
    order_date: Optional[datetime] = None
    last_modified: Optional[datetime] = None
    items: List[OrderItem] = field(default_factory=list)
    total: float = 0.0
    specific_customer_name: str = ""
    dine_in_table_text: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "order_id": self.order_id,
            "status": self.status.value,
            "order_type": self.order_type,
            "employee_name": self.employee_name,
            "customer_name": self.customer_name,
            "order_date": self.order_date.isoformat() if self.order_date else None,
            "last_modified": self.last_modified.isoformat() if self.last_modified else None,
            "specific_customer_name": self.specific_customer_name,
            "dine_in_table_text": self.dine_in_table_text,
            "items": [
                {
                    "item_id": item.item_id,
                    "name": item.name,
                    "quantity": item.quantity,
                    "price": item.price,
                    "status": item.status.value,
                    "modifiers": item.modifiers,
                    "transaction_status": item.transaction_status,
                    "notification": item.notification,
                    "short_note": item.short_note,
                } for item in self.items
            ],
            "total": self.total
        }
