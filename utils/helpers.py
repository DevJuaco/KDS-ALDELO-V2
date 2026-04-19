"""
Utilidades generales para la aplicación
"""
import os
import logging
from datetime import datetime


def leer_puerto():
    """Lee el puerto desde port.txt, si no existe usa 5000 por defecto"""
    file_path = "port.txt"
    if os.path.exists(file_path):
        try:
            with open(file_path, "r") as f:
                puerto = int(f.read().strip())
            logging.info(f"Puerto obtenido de port.txt: {puerto}")
            return puerto
        except ValueError:
            logging.warning("El valor en port.txt no es un número válido, usando 5000 por defecto")
            return 5000
    else:
        logging.info("Archivo port.txt no encontrado, creando con puerto 5000")
        with open(file_path, "w") as f:
            f.write("5000")
        return 5000


def normalize_value(key, value):
    """Normaliza valores según su tipo para inserción en base de datos"""
    if value in (None, "", "null"):
        return None

    # Campos de texto corto en Access (forzar string)
    text_fields = (
        "MenuItemNotification", "NotificationStatus", "TransactionStatus",
        "Status", "EmployeeName", "MenuItemText", "ScriptDetails"
    )
    if key in text_fields:
        return str(value)

    # Intentar convertir fecha
    if key == "OrderDateTime":
        try:
            # Detectar formato como: "Fri, 24 Oct 2025 14:07:06 GMT"
            return datetime.strptime(value, "%a, %d %b %Y %H:%M:%S %Z")
        except Exception:
            try:
                # Intentar formato ISO
                return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
            except Exception:
                logging.warning(f"⚠️ No se pudo convertir la fecha: {value}")
                return None

    # Campos numéricos (int o float)
    if isinstance(value, (int, float)):
        return value

    if isinstance(value, str):
        v = value.strip()
        if v.replace('.', '', 1).isdigit():
            if '.' in v:
                return float(v)
            else:
                return int(v)

    return value


def parse_config_file():
    """Lee el archivo de configuración y extrae los campos requeridos"""
    from utils.database import leer_clave_registro
    
    ruta = leer_clave_registro()
    directorio_base = os.path.dirname(ruta)
    CONFIG_FILE = os.path.join(directorio_base, "adResSettings.dat")
    
    data = {
        "DineInAliase": None,
        "TakeOutAliase": None,
        "DriveThruAliase": None,
        "DeliveryAliase": None,
        "StartOfDayTime": None
    }

    if not os.path.exists(CONFIG_FILE):
        return {"error": f"Archivo no encontrado: {CONFIG_FILE}"}

    with open(CONFIG_FILE, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if line.startswith("Dine In Aliase="):
                data["DineInAliase"] = line.split("=", 1)[1].strip()
            elif line.startswith("Take Out Aliase="):
                data["TakeOutAliase"] = line.split("=", 1)[1].strip()
            elif line.startswith("Drive Thru Aliase="):
                data["DriveThruAliase"] = line.split("=", 1)[1].strip()
            elif line.startswith("Delivery Aliase="):
                data["DeliveryAliase"] = line.split("=", 1)[1].strip()
            elif line.startswith("Start Of Day Time="):
                data["StartOfDayTime"] = line.split("=", 1)[1].strip()

    # Asignar valores por defecto si están vacíos o None
    if not data["DineInAliase"]:
        data["DineInAliase"] = "Mesas"
    if not data["TakeOutAliase"]:
        data["TakeOutAliase"] = "Para Llevar"
    if not data["DriveThruAliase"]:
        data["DriveThruAliase"] = "Drive-In"
    if not data["DeliveryAliase"]:
        data["DeliveryAliase"] = "Domicilio"

    return data
