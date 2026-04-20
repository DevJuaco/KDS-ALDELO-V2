import json
import os
from datetime import datetime, time
from threading import Lock
from pathlib import Path


class OrderStateManager:
    """
    Gestiona la persistencia de estados de órdenes en JSON.
    Solo persiste cambios locales del KDS (no toca Access/Aldelo).
    Limpieza automática de órdenes entregadas al detectar cambio de día (3 AM).
    """
    
    def __init__(self, state_file="orders_state.json"):
        """
        Inicializa el gestor de estados.
        
        Args:
            state_file: Ruta del archivo JSON para persistencia
        """
        self.state_file = state_file
        self._lock = Lock()
        self._state = {"orders": {}, "last_cleanup_date": None}
        
        # Cargar estado previo si existe
        self._load_state()
        
        # Detectar y limpiar si pasó a nuevo día
        self._check_and_cleanup_if_new_day()
    
    def _load_state(self):
        """Carga el estado desde JSON si existe, sino crea vacío."""
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, 'r', encoding='utf-8') as f:
                    loaded = json.load(f)
                    if isinstance(loaded, dict) and "orders" in loaded:
                        self._state = loaded
                    else:
                        self._state = {"orders": {}, "last_cleanup_date": None}
            except (json.JSONDecodeError, IOError):
                # Si el archivo está corrupto, comenzar nuevo
                self._state = {"orders": {}, "last_cleanup_date": None}
        else:
            self._state = {"orders": {}, "last_cleanup_date": None}
    
    def _save_state(self):
        """Guarda el estado actual a JSON."""
        try:
            # Crear backup antes de sobrescribir
            if os.path.exists(self.state_file):
                backup_file = f"{self.state_file}.backup"
                with open(self.state_file, 'r', encoding='utf-8') as f:
                    backup_content = f.read()
                with open(backup_file, 'w', encoding='utf-8') as f:
                    f.write(backup_content)
            
            # Guardar estado actual
            with open(self.state_file, 'w', encoding='utf-8') as f:
                json.dump(self._state, f, indent=2, ensure_ascii=False)
        except IOError as e:
            print(f"Error guardando estado: {e}")
    
    def _get_order_date(self, order_id):
        """
        Extrae la fecha de una orden del JSON.
        Formato esperado: order_data tiene 'date' o se calcula de 'last_modified'
        """
        order = self._state["orders"].get(str(order_id), {})
        
        # Si tiene campo date, usar eso
        if "date" in order:
            try:
                return datetime.fromisoformat(order["date"]).date()
            except (ValueError, TypeError):
                pass
        
        # Si no, intentar extraer de last_modified
        if "last_modified" in order:
            try:
                return datetime.fromisoformat(order["last_modified"]).date()
            except (ValueError, TypeError):
                pass
        
        # Por defecto, hoy
        return datetime.now().date()
    
    def _is_new_day(self):
        """
        Detecta si pasó a un nuevo día.
        Línea de corte: 3 AM (03:00:00)
        Retorna True si debe ejecutar limpieza.
        """
        current_date = datetime.now().date()
        last_cleanup = self._state.get("last_cleanup_date")
        
        if last_cleanup is None:
            # Primera vez, registrar hoy
            return False
        
        try:
            last_cleanup_date = datetime.fromisoformat(last_cleanup).date()
            # Si la fecha cambió, es nuevo día
            return current_date > last_cleanup_date
        except (ValueError, TypeError):
            return False
    
    def _check_and_cleanup_if_new_day(self):
        """
        Verifica si pasó a nuevo día y limpia órdenes entregadas.
        Se ejecuta automáticamente al iniciar y al detectar cambio de día.
        """
        if self._is_new_day():
            self._cleanup_delivered_orders()
    
    def _cleanup_delivered_orders(self):
        """Elimina órdenes con estado DELIVERED (limpieza diaria)."""
        with self._lock:
            orders_to_remove = []
            
            for order_id, order_data in self._state["orders"].items():
                if order_data.get("status") == "DELIVERED":
                    orders_to_remove.append(order_id)
            
            for order_id in orders_to_remove:
                del self._state["orders"][order_id]
            
            # Registrar fecha de último cleanup
            self._state["last_cleanup_date"] = datetime.now().isoformat()
            
            self._save_state()
            
            if orders_to_remove:
                print(f"[OrderStateManager] Limpieza diaria: eliminadas {len(orders_to_remove)} órdenes entregadas")
    
    def update_order_status(self, order_id, status, order_data=None):
        """
        Actualiza el estado de una orden en el JSON.
        
        Args:
            order_id: ID de la orden
            status: Nuevo estado (CREATED, IN_PROGRESS, READY, DELIVERED)
            order_data: (Opcional) Datos adicionales de la orden
        """
        with self._lock:
            order_id_str = str(order_id)
            
            if order_id_str not in self._state["orders"]:
                self._state["orders"][order_id_str] = {
                    "status": status,
                    "items": {},
                    "date": datetime.now().isoformat(),
                    "last_modified": datetime.now().isoformat()
                }
            else:
                self._state["orders"][order_id_str]["status"] = status
                self._state["orders"][order_id_str]["last_modified"] = datetime.now().isoformat()
            
            # Agregar datos adicionales si se proporcionan
            if order_data:
                self._state["orders"][order_id_str].update(order_data)
            
            self._save_state()
            
            # Verificar si pasó a nuevo día después de guardar
            self._check_and_cleanup_if_new_day()
    
    def update_item_status(self, order_id, item_id, status):
        """
        Actualiza el estado de un item (platillo) dentro de una orden.
        
        Args:
            order_id: ID de la orden
            item_id: ID del item/platillo
            status: Nuevo estado
        """
        with self._lock:
            order_id_str = str(order_id)
            item_id_str = str(item_id)
            
            if order_id_str not in self._state["orders"]:
                self._state["orders"][order_id_str] = {
                    "status": "IN_PROGRESS",
                    "items": {},
                    "date": datetime.now().isoformat(),
                    "last_modified": datetime.now().isoformat()
                }
            
            if "items" not in self._state["orders"][order_id_str]:
                self._state["orders"][order_id_str]["items"] = {}
            
            self._state["orders"][order_id_str]["items"][item_id_str] = {
                "status": status,
                "last_modified": datetime.now().isoformat()
            }
            
            self._state["orders"][order_id_str]["last_modified"] = datetime.now().isoformat()
            
            self._save_state()
            
            # Verificar si pasó a nuevo día
            self._check_and_cleanup_if_new_day()
    
    def get_order_state(self, order_id):
        """
        Obtiene el estado guardado de una orden.
        Retorna None si no existe en el JSON.
        """
        with self._lock:
            return self._state["orders"].get(str(order_id))
    
    def get_all_states(self):
        """Retorna todos los estados guardados."""
        with self._lock:
            return dict(self._state["orders"])
    
    def clear_order(self, order_id):
        """Elimina una orden del JSON (limpieza manual)."""
        with self._lock:
            order_id_str = str(order_id)
            if order_id_str in self._state["orders"]:
                del self._state["orders"][order_id_str]
                self._save_state()
    
    def clear_all_delivered(self):
        """Limpia todas las órdenes entregadas (limpieza manual)."""
        self._cleanup_delivered_orders()
    
    def export_state(self):
        """Exporta todo el estado (para backup)."""
        with self._lock:
            return json.dumps(self._state, indent=2, ensure_ascii=False)
    
    def import_state(self, state_json):
        """Importa estado desde JSON (para restore)."""
        try:
            with self._lock:
                loaded = json.loads(state_json)
                if isinstance(loaded, dict) and "orders" in loaded:
                    self._state = loaded
                    self._save_state()
                    return True
        except json.JSONDecodeError:
            return False
        return False
    
    def get_state_file_path(self):
        """Retorna la ruta absoluta del archivo de estado."""
        return os.path.abspath(self.state_file)
