import logging
from pathlib import Path
from flask import Flask, send_from_directory
from app.repositories.order_repository import OrderRepository
from app.services.order_service import OrderService
from app.controllers.order_controller import create_order_blueprint
from app.controllers.config_controller import config_bp
from app.websockets.order_socket import OrderSocketHandler
from flask_cors import CORS

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("kds_api.log")
    ]
)

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST = BASE_DIR / 'frontend' / 'dist'

app = Flask(
    __name__,
    static_folder=str(FRONTEND_DIST),
    static_url_path=''
)

if not FRONTEND_DIST.exists():
    logging.warning("Frontend dist folder not found at %s. Build the frontend with npm run build.", FRONTEND_DIST)

# Enable CORS for the REST endpoints
CORS(app)
app.config['SECRET_KEY'] = 'kds_secret_key'

# Dependency Injection
order_repo = OrderRepository()
order_service = OrderService(order_repo)

# Initialize Raw WebSockets (flask-sock)
# The handler will register its own route at /ws/orders
order_socket_handler = OrderSocketHandler(app, order_service)

# Register Blueprints
app.register_blueprint(create_order_blueprint(order_service))
app.register_blueprint(config_bp)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    """Serve the React build from frontend/dist."""
    if path and (FRONTEND_DIST / path).exists():
        return send_from_directory(str(FRONTEND_DIST), path)
    return send_from_directory(str(FRONTEND_DIST), 'index.html')

if __name__ == '__main__':
    # Start the background polling service
    order_service.start_polling(interval=2.5)
    
    # Run the server using Flask's built-in server with threading
    # On Windows, threading=True is usually more stable for raw WebSockets during development
    logging.info("Starting KDS Server (Raw WebSockets) on port 5001...")
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)
