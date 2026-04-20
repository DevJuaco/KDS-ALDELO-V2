"""
Utilidades para manejo de conexiones a base de datos
"""
import pyodbc
import os
import winreg
import logging


_ruta_db = None
_ruta_db_kds = None
_first_conn = True
_first_conn2 = True

def leer_clave_registro():
    """Lee la ruta de la base de datos principal desde archivo o registro"""
    global _ruta_db
    if _ruta_db is not None:
        return _ruta_db

    file_path = "database.txt"
    if os.path.exists(file_path):
        with open(file_path, "r") as f:
            valor = f.read().strip()
        logging.info(f"Ruta obtenida de database.txt: {valor}")
        _ruta_db = valor
        return valor
    try:
        ruta = r"Software\VB and VBA Program Settings\Aldelo For Restaurants\Version 3"
        clave = "Data Source"
        reg = winreg.OpenKey(winreg.HKEY_CURRENT_USER, ruta, 0, winreg.KEY_READ)
        valor, _ = winreg.QueryValueEx(reg, clave)
        winreg.CloseKey(reg)
        with open(file_path, "w") as f:
            f.write(valor)
        logging.info(f"Ruta obtenida del registro y guardada: {valor}")
        _ruta_db = valor
        return valor
    except FileNotFoundError:
        logging.error("Clave no encontrada en el registro")
        return "Clave no encontrada"
    except Exception as e:
        logging.error(f"Error al leer registro: {e}")
        return f"Error: {e}"


def leer_clave_registro2():
    """Lee la ruta de la base de datos KDS desde archivo o registro"""
    global _ruta_db_kds
    if _ruta_db_kds is not None:
        return _ruta_db_kds

    file_path = "databasekds.txt"
    if os.path.exists(file_path):
        with open(file_path, "r") as f:
            valor = f.read().strip()
        logging.info(f"Ruta obtenida de databasekds.txt: {valor}")
        _ruta_db_kds = valor
        return valor
    try:
        ruta = r"Software\VB and VBA Program Settings\Aldelo For Restaurants\Version 3"
        clave = "KDS Data Source"
        reg = winreg.OpenKey(winreg.HKEY_CURRENT_USER, ruta, 0, winreg.KEY_READ)
        valor, _ = winreg.QueryValueEx(reg, clave)
        winreg.CloseKey(reg)
        with open(file_path, "w") as f:
            f.write(valor)
        logging.info(f"Ruta obtenida del registro y guardada: {valor}")
        _ruta_db_kds = valor
        return valor
    except FileNotFoundError:
        logging.error("Clave no encontrada en el registro kds")
        return "Clave no encontrada kds"
    except Exception as e:
        logging.error(f"Error al leer registro kds: {e}")
        return f"Error kds: {e}"


def reset_db_path():
    """Reset cached DB path so it is re-read from database.txt on the next connection"""
    global _ruta_db, _first_conn
    _ruta_db = None
    _first_conn = True


def dbconn():
    """Conexión a la base de datos principal"""
    global _first_conn
    ruta = leer_clave_registro()
    
    if _first_conn:
        logging.info(f"Conectando a la base de datos en: {ruta}")
        _first_conn = False
        
    try:
        access_conn = pyodbc.connect(
            rf'DRIVER={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={ruta};'
        )
        access_cursor = access_conn.cursor()
        return access_conn, access_cursor
    except Exception as e:
        logging.critical(f"Error al conectar con la base de datos: {e}")
        raise


def dbconn2(max_retries=3, retry_delay=1):
    """Conexión a la base de datos KDS con acceso compartido y reintentos"""
    global _first_conn2
    import time
    ruta = leer_clave_registro2()
    
    if _first_conn2:
        logging.info(f"Conectando a la base de datos KDS en: {ruta}")
        _first_conn2 = False
        
    for attempt in range(1, max_retries + 1):
        try:
            access_conn = pyodbc.connect(
                rf'DRIVER={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={ruta};'
            )
            access_conn.autocommit = True
            access_cursor = access_conn.cursor()
            return access_conn, access_cursor
        except pyodbc.Error as e:
            error_code = e.args[0] if e.args else ''
            if error_code in ('HY000',) and attempt < max_retries:
                logging.warning(f"⚠️ Intento {attempt}/{max_retries} - DB KDS bloqueada, reintentando en {retry_delay}s...")
                time.sleep(retry_delay)
            else:
                logging.critical(f"❌ Error al conectar con la base de datos KDS (intento {attempt}): {e}")
                raise
        except Exception as e:
            logging.critical(f"❌ Error al conectar con la base de datos KDS: {e}")
            raise
