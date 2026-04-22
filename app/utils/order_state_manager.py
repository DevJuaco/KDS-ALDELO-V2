import os
import sys
import pyodbc
from datetime import datetime, time
from threading import Lock
from pathlib import Path
from typing import Dict, List, Optional, Any
import json


class OrderStateManager:
    """
    Gestiona la persistencia de estados de órdenes en base de datos Access.
    Solo persiste cambios locales del KDS (no toca Access/Aldelo).
    Limpieza automática de órdenes entregadas al detectar cambio de día (3 AM).
    """

    def __init__(self, db_path="kds.accdb"):
        """
        Inicializa el gestor de estados.

        Args:
            db_path: Ruta de la base de datos Access (relativa o absoluta)
        """
        # Convertir a ruta absoluta
        if not os.path.isabs(db_path):
            # En modo frozen (PyInstaller) __file__ apunta a _MEIPASS, no al exe
            if getattr(sys, 'frozen', False):
                project_root = os.path.dirname(sys.executable)
            else:
                project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            db_path = os.path.join(project_root, db_path)
        
        # Normalizar la ruta
        self.db_path = os.path.normpath(os.path.abspath(db_path))
        
        # Crear connection string con ruta absoluta (con comillas para soportar espacios)
        # Usar PWD en lugar de DBQ para mejor compatibilidad
        self._connection_string = (
            f'DRIVER={{Microsoft Access Driver (*.mdb, *.accdb)}};'
            f'DBQ={self.db_path};'
            f'Exclusive=No;'
        )
        
        self._lock = Lock()

        print(f"[OrderStateManager] Base de datos: {self.db_path}")
        
        # Crear base de datos si no existe
        self._ensure_database_exists()

        # Verificar y crear tablas si no existen
        self._ensure_tables_exist()

        # Detectar y limpiar si pasó a nuevo día
        self._check_and_cleanup_if_new_day()

    def _ensure_database_exists(self):
        """Asegura que la base de datos existe."""
        if not os.path.exists(self.db_path):
            print(f"[OrderStateManager] Base de datos {self.db_path} no existe. Creándola...")
            try:
                self._create_database()
            except Exception as e:
                print(f"[OrderStateManager] Error creando base de datos: {e}")
                print(f"[OrderStateManager] Asegúrate de crear kds.accdb manualmente usando create_kds_db.py")
                raise
        else:
            print(f"[OrderStateManager] Base de datos encontrada: {self.db_path}")

    def _create_database(self):
        """Crea la base de datos Access con las tablas necesarias."""
        try:
            # Crear archivo vacío
            with open(self.db_path, 'wb') as f:
                f.write(b'')

            # Conectar y crear tablas
            conn = pyodbc.connect(self._connection_string, autocommit=True)
            cursor = conn.cursor()

            # Crear tabla orders_state
            cursor.execute('''
                CREATE TABLE orders_state (
                    order_id INTEGER PRIMARY KEY,
                    status TEXT(20),
                    date DATETIME,
                    last_modified DATETIME
                )
            ''')

            # Crear tabla order_items_state
            cursor.execute('''
                CREATE TABLE order_items_state (
                    order_id INTEGER,
                    item_id INTEGER,
                    status TEXT(20),
                    last_modified DATETIME,
                    PRIMARY KEY (order_id, item_id)
                )
            ''')

            # Crear tabla cleanup_log
            cursor.execute('''
                CREATE TABLE cleanup_log (
                    id AUTOINCREMENT PRIMARY KEY,
                    cleanup_date DATETIME,
                    orders_cleaned INTEGER,
                    created_at DATETIME DEFAULT NOW()
                )
            ''')

            conn.close()
            print(f"[OrderStateManager] Base de datos {self.db_path} creada exitosamente")

        except Exception as e:
            print(f"[OrderStateManager] Error creando base de datos: {e}")
            print("[OrderStateManager] Crea la base de datos manualmente con Access usando las instrucciones en create_kds_db.py")
            raise

    def _ensure_tables_exist(self):
        """Verifica que las tablas existen, si no, las crea."""
        try:
            print(f"[OrderStateManager] Verificando tablas en {self.db_path}...")
            conn = self._get_connection()
            cursor = conn.cursor()

            # Verificar tabla orders_state
            try:
                cursor.execute("SELECT COUNT(*) FROM orders_state")
                print("[OrderStateManager] Tabla 'orders_state' encontrada")
            except:
                print("[OrderStateManager] Creando tabla 'orders_state'...")
                cursor.execute('''
                    CREATE TABLE orders_state (
                        order_id INTEGER PRIMARY KEY,
                        status TEXT(20),
                        date DATETIME,
                        last_modified DATETIME
                    )
                ''')

            # Verificar tabla order_items_state
            try:
                cursor.execute("SELECT COUNT(*) FROM order_items_state")
                print("[OrderStateManager] Tabla 'order_items_state' encontrada")
            except:
                print("[OrderStateManager] Creando tabla 'order_items_state'...")
                cursor.execute('''
                    CREATE TABLE order_items_state (
                        order_id INTEGER,
                        item_id INTEGER,
                        status TEXT(20),
                        last_modified DATETIME,
                        PRIMARY KEY (order_id, item_id)
                    )
                ''')

            # Verificar tabla cleanup_log
            try:
                cursor.execute("SELECT COUNT(*) FROM cleanup_log")
                print("[OrderStateManager] Tabla 'cleanup_log' encontrada")
            except:
                print("[OrderStateManager] Creando tabla 'cleanup_log'...")
                cursor.execute('''
                    CREATE TABLE cleanup_log (
                        id AUTOINCREMENT PRIMARY KEY,
                        cleanup_date DATETIME,
                        orders_cleaned INTEGER,
                        created_at DATETIME DEFAULT NOW()
                    )
                ''')

            conn.close()
            print("[OrderStateManager] Todas las tablas están listas")

        except Exception as e:
            print(f"[OrderStateManager] Error verificando/creando tablas: {e}")
            print(f"[OrderStateManager] Por favor ejecuta: python create_kds_db.py")
            raise

    def _get_connection(self):
        """Obtiene una conexión a la base de datos."""
        try:
            return pyodbc.connect(self._connection_string, autocommit=True)
        except Exception as e:
            print(f"[OrderStateManager] Error conectando a {self.db_path}: {e}")
            print(f"[OrderStateManager] Connection string: {self._connection_string}")
            print(f"[OrderStateManager] ¿Existe el archivo? {os.path.exists(self.db_path)}")
            raise

    def _is_new_day(self):
        """
        Detecta si pasó a un nuevo día.
        Línea de corte: 3 AM (03:00:00)
        Retorna True si debe ejecutar limpieza.
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            # Obtener última fecha de limpieza
            cursor.execute("SELECT TOP 1 cleanup_date FROM cleanup_log ORDER BY cleanup_date DESC")
            row = cursor.fetchone()

            conn.close()

            current_date = datetime.now().date()

            if row and row[0]:
                last_cleanup_date = row[0].date() if hasattr(row[0], 'date') else row[0]
                return current_date > last_cleanup_date
            else:
                # Primera vez
                return False

        except Exception as e:
            print(f"[OrderStateManager] Error verificando cambio de día: {e}")
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
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            # Contar órdenes a eliminar
            cursor.execute("SELECT COUNT(*) FROM orders_state WHERE [status] = 'DELIVERED'")
            count_before = cursor.fetchone()[0]

            # Eliminar órdenes entregadas
            cursor.execute("DELETE FROM orders_state WHERE [status] = 'DELIVERED'")

            # Eliminar items de órdenes eliminadas
            cursor.execute("DELETE FROM order_items_state WHERE order_id NOT IN (SELECT order_id FROM orders_state)")

            # Registrar limpieza
            cursor.execute("INSERT INTO cleanup_log (cleanup_date, orders_cleaned) VALUES (?, ?)",
                         (datetime.now(), count_before))

            conn.close()

            if count_before > 0:
                print(f"[OrderStateManager] Limpieza diaria: eliminadas {count_before} órdenes entregadas")

        except Exception as e:
            print(f"[OrderStateManager] Error en limpieza diaria: {e}")

    def update_order_status(self, order_id, status, order_data=None):
        """
        Actualiza el estado de una orden en la base de datos.

        Args:
            order_id: ID de la orden
            status: Nuevo estado (CREATED, IN_PROGRESS, READY, DELIVERED)
            order_data: (Opcional) Datos adicionales de la orden
        """
        with self._lock:
            try:
                conn = self._get_connection()
                cursor = conn.cursor()

                # Convertir datetime a string para mejor compatibilidad con Access
                now = datetime.now()

                # Verificar si la orden existe
                try:
                    cursor.execute("SELECT order_id FROM orders_state WHERE order_id = ?", (order_id,))
                    exists = cursor.fetchone()
                except Exception as e:
                    print(f"[OrderStateManager] Error SELECT: {e}")
                    exists = False

                if exists:
                    # Actualizar
                    try:
                        cursor.execute("""
                            UPDATE orders_state
                            SET [status] = ?, [last_modified] = ?
                            WHERE order_id = ?
                        """, (status, now, order_id))
                    except Exception as e:
                        print(f"[OrderStateManager] Error UPDATE order {order_id}: {e}")
                        raise
                else:
                    # Insertar
                    try:
                        if order_data and 'date' in order_data:
                            try:
                                if isinstance(order_data['date'], datetime):
                                    order_date = order_data['date']
                                elif isinstance(order_data['date'], str):
                                    # Intentar parsear si es string
                                    try:
                                        order_date = datetime.fromisoformat(order_data['date'].replace('Z', '+00:00'))
                                    except:
                                        order_date = now
                                else:
                                    order_date = now
                            except:
                                order_date = now
                        else:
                            order_date = now

                        cursor.execute("""
                            INSERT INTO orders_state (order_id, [status], [date], [last_modified])
                            VALUES (?, ?, ?, ?)
                        """, (order_id, status, order_date, now))
                    except Exception as e:
                        print(f"[OrderStateManager] Error INSERT order {order_id}: {e}")
                        raise

                # Actualizar items si se proporcionan
                if order_data and 'items' in order_data:
                    for item_id_str, item_data in order_data['items'].items():
                        try:
                            item_id = int(item_id_str)
                            item_status = item_data.get('status', 'CREATED')

                            # Verificar si el item existe
                            try:
                                cursor.execute("""
                                    SELECT order_id FROM order_items_state
                                    WHERE order_id = ? AND item_id = ?
                                """, (order_id, item_id))
                                item_exists = cursor.fetchone()
                            except:
                                item_exists = False

                            if item_exists:
                                cursor.execute("""
                                    UPDATE order_items_state
                                    SET [status] = ?, [last_modified] = ?
                                    WHERE order_id = ? AND item_id = ?
                                """, (item_status, now, order_id, item_id))
                            else:
                                cursor.execute("""
                                    INSERT INTO order_items_state (order_id, item_id, [status], [last_modified])
                                    VALUES (?, ?, ?, ?)
                                """, (order_id, item_id, item_status, now))
                        except Exception as e:
                            print(f"[OrderStateManager] Error actualizando item {item_id} de orden {order_id}: {e}")

                conn.close()

                # Verificar si pasó a nuevo día
                self._check_and_cleanup_if_new_day()

            except Exception as e:
                print(f"[OrderStateManager] Error guardando estado de orden {order_id}: {e}")
                import traceback
                traceback.print_exc()
                raise

    def update_item_status(self, order_id, item_id, status):
        """
        Actualiza el estado de un item (platillo) dentro de una orden.

        Args:
            order_id: ID de la orden
            item_id: ID del item/platillo
            status: Nuevo estado
        """
        with self._lock:
            try:
                conn = self._get_connection()
                cursor = conn.cursor()

                # Convertir datetime a string para mejor compatibilidad con Access
                now = datetime.now()

                # Verificar si el item existe
                try:
                    cursor.execute("""
                        SELECT order_id FROM order_items_state
                        WHERE order_id = ? AND item_id = ?
                    """, (order_id, item_id))
                    item_exists = cursor.fetchone()
                except Exception as e:
                    print(f"[OrderStateManager] Error SELECT item: {e}")
                    item_exists = False

                if item_exists:
                    # Actualizar
                    try:
                        cursor.execute("""
                            UPDATE order_items_state
                            SET [status] = ?, [last_modified] = ?
                            WHERE order_id = ? AND item_id = ?
                        """, (status, now, order_id, item_id))
                    except Exception as e:
                        print(f"[OrderStateManager] Error UPDATE item {item_id}: {e}")
                        raise
                else:
                    # Insertar
                    try:
                        cursor.execute("""
                            INSERT INTO order_items_state (order_id, item_id, [status], [last_modified])
                            VALUES (?, ?, ?, ?)
                        """, (order_id, item_id, status, now))
                    except Exception as e:
                        print(f"[OrderStateManager] Error INSERT item {item_id}: {e}")
                        raise

                conn.close()

                # Verificar si pasó a nuevo día
                self._check_and_cleanup_if_new_day()

            except Exception as e:
                print(f"[OrderStateManager] Error guardando estado de item {item_id} en orden {order_id}: {e}")
                import traceback
                traceback.print_exc()
                raise

    def get_order_state(self, order_id):
        """
        Obtiene el estado guardado de una orden.
        Retorna None si no existe en la base de datos.
        """
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            # Obtener estado de la orden
            cursor.execute("""
                SELECT order_id, [status], [date], [last_modified]
                FROM orders_state
                WHERE order_id = ?
            """, (order_id,))

            order_row = cursor.fetchone()

            if not order_row:
                conn.close()
                return None

            # Obtener items de la orden
            cursor.execute("""
                SELECT item_id, [status], [last_modified]
                FROM order_items_state
                WHERE order_id = ?
                ORDER BY item_id
            """, (order_id,))

            items = {}
            for item_row in cursor.fetchall():
                items[str(item_row[0])] = {
                    'status': item_row[1],
                    'last_modified': item_row[2].isoformat() if item_row[2] else None
                }

            conn.close()

            return {
                'order_id': order_row[0],
                'status': order_row[1],
                'date': order_row[2].isoformat() if order_row[2] else None,
                'last_modified': order_row[3].isoformat() if order_row[3] else None,
                'items': items
            }

        except Exception as e:
            print(f"[OrderStateManager] Error obteniendo estado de orden {order_id}: {e}")
            return None

    def get_all_states(self):
        """Retorna todos los estados guardados."""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            # Obtener todas las órdenes
            cursor.execute("""
                SELECT order_id, [status], [date], [last_modified]
                FROM orders_state
                ORDER BY order_id
            """)

            orders = {}
            for row in cursor.fetchall():
                order_id = str(row[0])
                orders[order_id] = {
                    'order_id': row[0],
                    'status': row[1],
                    'date': row[2].isoformat() if row[2] else None,
                    'last_modified': row[3].isoformat() if row[3] else None,
                    'items': {}
                }

            # Obtener todos los items
            cursor.execute("""
                SELECT order_id, item_id, [status], [last_modified]
                FROM order_items_state
                ORDER BY order_id, item_id
            """)

            for row in cursor.fetchall():
                order_id = str(row[0])
                item_id = str(row[1])

                if order_id in orders:
                    orders[order_id]['items'][item_id] = {
                        'status': row[2],
                        'last_modified': row[3].isoformat() if row[3] else None
                    }

            conn.close()
            return orders

        except Exception as e:
            print(f"[OrderStateManager] Error obteniendo todos los estados: {e}")
            return {}

    def clear_order(self, order_id):
        """Elimina una orden del estado persistente (limpieza manual)."""
        with self._lock:
            try:
                conn = self._get_connection()
                cursor = conn.cursor()

                # Eliminar orden
                cursor.execute("DELETE FROM orders_state WHERE order_id = ?", (order_id,))

                # Eliminar items de la orden
                cursor.execute("DELETE FROM order_items_state WHERE order_id = ?", (order_id,))

                conn.close()

            except Exception as e:
                print(f"[OrderStateManager] Error eliminando orden {order_id}: {e}")
                raise

    def clear_all_delivered(self):
        """Limpia todas las órdenes entregadas (limpieza manual)."""
        self._cleanup_delivered_orders()

    def export_state(self):
        """Exporta todo el estado (para backup)."""
        states = self.get_all_states()
        return json.dumps(states, indent=2, ensure_ascii=False)

    def import_state(self, state_json):
        """Importa estado desde JSON (para restore)."""
        try:
            with self._lock:
                states = json.loads(state_json)

                conn = self._get_connection()
                cursor = conn.cursor()

                # Limpiar tablas existentes
                cursor.execute("DELETE FROM order_items_state")
                cursor.execute("DELETE FROM orders_state")

                # Importar órdenes
                for order_id_str, order_data in states.items():
                    order_id = int(order_id_str)

                    # Insertar orden
                    cursor.execute("""
                        INSERT INTO orders_state (order_id, [status], [date], [last_modified])
                        VALUES (?, ?, ?, ?)
                    """, (
                        order_id,
                        order_data.get('status', 'CREATED'),
                        datetime.fromisoformat(order_data['date']) if order_data.get('date') else datetime.now(),
                        datetime.fromisoformat(order_data['last_modified']) if order_data.get('last_modified') else datetime.now()
                    ))

                    # Insertar items
                    for item_id_str, item_data in order_data.get('items', {}).items():
                        item_id = int(item_id_str)
                        cursor.execute("""
                            INSERT INTO order_items_state (order_id, item_id, [status], [last_modified])
                            VALUES (?, ?, ?, ?)
                        """, (
                            order_id,
                            item_id,
                            item_data.get('status', 'CREATED'),
                            datetime.fromisoformat(item_data['last_modified']) if item_data.get('last_modified') else datetime.now()
                        ))

                conn.close()
                return True

        except Exception as e:
            print(f"[OrderStateManager] Error importando estado: {e}")
            return False

    def get_state_file_path(self):
        """Retorna la ruta absoluta de la base de datos."""
        return os.path.abspath(self.db_path)

    def get_stats(self):
        """Retorna estadísticas de la base de datos."""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            stats = {}

            # Contar órdenes por estado
            cursor.execute("""
                SELECT status, COUNT(*) as count
                FROM orders_state
                GROUP BY status
            """)

            stats['orders_by_status'] = {row[0]: row[1] for row in cursor.fetchall()}

            # Total de órdenes
            cursor.execute("SELECT COUNT(*) FROM orders_state")
            stats['total_orders'] = cursor.fetchone()[0]

            # Total de items
            cursor.execute("SELECT COUNT(*) FROM order_items_state")
            stats['total_items'] = cursor.fetchone()[0]

            # Última limpieza
            cursor.execute("SELECT TOP 1 cleanup_date, orders_cleaned FROM cleanup_log ORDER BY cleanup_date DESC")
            row = cursor.fetchone()
            if row:
                stats['last_cleanup'] = {
                    'date': row[0].isoformat() if row[0] else None,
                    'orders_cleaned': row[1]
                }

            conn.close()
            return stats

        except Exception as e:
            print(f"[OrderStateManager] Error obteniendo estadísticas: {e}")
            return {}
