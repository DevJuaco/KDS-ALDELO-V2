"""
Backend API-only entry point — sin servir el frontend.
Usar este archivo para compilar con PyInstaller o para Electron packaging.
Ejecutar con: py main_api.py
"""
import sys
import os
import logging
from pathlib import Path

# PyInstaller: rutas relativas al ejecutable en lugar del .py
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).resolve().parent
else:
    BASE_DIR = Path(__file__).resolve().parent

os.chdir(BASE_DIR)

from flask import Flask
from flask_cors import CORS
from app.repositories.order_repository import OrderRepository
from app.services.order_service import OrderService
from app.controllers.order_controller import create_order_blueprint
from app.controllers.config_controller import config_bp
from app.websockets.order_socket import OrderSocketHandler

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(str(BASE_DIR / 'kds_api.log'))
    ]
)

app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = 'kds_secret_key'

order_repo = OrderRepository()
order_service = OrderService(order_repo)
order_socket_handler = OrderSocketHandler(app, order_service)

app.register_blueprint(create_order_blueprint(order_service))
app.register_blueprint(config_bp)

if __name__ == '__main__':
    order_service.start_polling(interval=2.5)
    logging.info("Starting KDS API Server on port 5001...")
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)
