from flask import Blueprint, jsonify, request
from app.services.order_service import OrderService

def create_order_blueprint(order_service: OrderService):
    bp = Blueprint('orders_kds', __name__)

    @bp.route('/orders/active', methods=['GET'])
    def get_active_orders():
        """
        Get active orders from cache
        """
        orders = order_service.get_all_active_orders()
        return jsonify([o.to_dict() for o in orders])

    @bp.route('/orders/<int:order_id>/status', methods=['POST'])
    def update_order_status(order_id):
        """
        Update order status
        """
        data = request.get_json()
        if not data or 'status' not in data:
            return jsonify({"error": "Missing status field"}), 400
        
        try:
            updated_order = order_service.update_order_status(order_id, data['status'])
            if not updated_order:
                return jsonify({"error": "Order not found"}), 404
            
            return jsonify(updated_order.to_dict())
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            return jsonify({"error": f"Internal error: {str(e)}"}), 500

    @bp.route('/orders/<int:order_id>/items/<int:item_id>/status', methods=['POST'])
    def update_item_status(order_id, item_id):
        """
        Update individual item status
        """
        data = request.get_json()
        if not data or 'status' not in data:
            return jsonify({"error": "Missing status field"}), 400
        
        try:
            updated_order = order_service.update_item_status(order_id, item_id, data['status'])
            if not updated_order:
                return jsonify({"error": "Order or Item not found"}), 404
            
            return jsonify(updated_order.to_dict())
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            return jsonify({"error": f"Internal error: {str(e)}"}), 500

    return bp
