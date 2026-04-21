import pyodbc
import os
from pathlib import Path

# Detecta automáticamente la raíz del proyecto (donde está este script)
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = os.path.join(BASE_DIR, "kds.accdb")

def get_connection():
    conn_str = (
        r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};"
        rf"DBQ={DB_PATH};"
    )
    return pyodbc.connect(conn_str)

def table_exists(cursor, table_name):
    tables = [row.table_name for row in cursor.tables(tableType='TABLE')]
    return table_name in tables

def create_tables():
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # 🟢 orders_state
        if not table_exists(cursor, 'orders_state'):
            cursor.execute("""
                CREATE TABLE orders_state (
                    order_id INTEGER PRIMARY KEY,
                    status TEXT(20),
                    [date] DATETIME,
                    last_modified DATETIME
                )
            """)
            print("Tabla orders_state creada")
        else:
            print("Tabla orders_state ya existe")

        # 🟢 order_items_state
        if not table_exists(cursor, 'order_items_state'):
            cursor.execute("""
                CREATE TABLE order_items_state (
                    order_id INTEGER,
                    item_id INTEGER,
                    status TEXT(20),
                    last_modified DATETIME,
                    CONSTRAINT pk_order_items PRIMARY KEY (order_id, item_id)
                )
            """)
            print("Tabla order_items_state creada")
        else:
            print("Tabla order_items_state ya existe")

        # 🟢 cleanup_log
        if not table_exists(cursor, 'cleanup_log'):
            cursor.execute("""
                CREATE TABLE cleanup_log (
                    id COUNTER PRIMARY KEY,
                    cleanup_date DATETIME,
                    orders_cleaned INTEGER,
                    created_at DATETIME
                )
            """)
            print("Tabla cleanup_log creada")
        else:
            print("Tabla cleanup_log ya existe")

        conn.commit()

    except Exception as e:
        print("Error:", e)
        conn.rollback()

    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    create_tables()