from flask_sock import Sock
import json
import logging
from datetime import datetime
from decimal import Decimal

# Helper to serialize special types from the database
def json_serial(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

class OrderSocketHandler:
    def __init__(self, app, order_service):
        self.sock = Sock(app)
        self.order_service = order_service
        self.clients = set()
        
        # Raw WebSocket route
        @self.sock.route('/ws/orders')
        def handle_ws(ws):
            logging.info("KDS Client connected via Raw WebSocket")
            self.clients.add(ws)
            
            try:
                # 1. Fetch active orders
                active_orders = self.order_service.get_all_active_orders()
                
                # 2. Try to send with robust serialization
                payload = json.dumps({
                    "type": "init", # Matches frontend switch case
                    "data": [o.to_dict() for o in active_orders]
                }, default=json_serial)
                
                ws.send(payload)
                logging.info(f"Initial state sent: {len(active_orders)} orders transmitted")
                
                # 3. Keep connection alive indefinitely
                # timeout=None prevents the 30-second automatic disconnection
                while True:
                    ws.receive(timeout=None)
            except Exception as e:
                # Log as info because standard client close is common
                logging.info(f"WebSocket session ended: {e}")
            finally:
                if ws in self.clients:
                    self.clients.remove(ws)
                logging.info("KDS Client disconnected")

        # Connect service events to our broadcast method
        self.order_service.set_event_callback(self._broadcast_event)

    def _broadcast_event(self, event_type: str, order):
        """Broadcasts event to all connected raw websocket clients in JSON format"""
        try:
            payload = json.dumps({
                "type": event_type, # order_created, order_updated
                "data": order.to_dict()
            }, default=json_serial)
            
            logging.info(f"Broadcasting {event_type} to {len(self.clients)} clients")
            
            for client in list(self.clients):
                try:
                    client.send(payload)
                except Exception:
                    if client in self.clients:
                        self.clients.remove(client)
        except Exception as e:
            logging.error(f"Error in broadcast: {e}")
