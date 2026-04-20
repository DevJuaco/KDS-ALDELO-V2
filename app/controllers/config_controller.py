import os
import json
from flask import Blueprint, jsonify, request
from utils.helpers import parse_config_file

config_bp = Blueprint('config', __name__, url_prefix='/config')


@config_bp.route('/ordertypes', methods=['GET'])
def get_aliases():
    result = parse_config_file()
    if 'error' in result:
        return jsonify(result), 404
    return jsonify(result), 200


@config_bp.route('/zones', methods=['GET'])
def get_zones():
    try:
        if not os.path.exists('zones.json'):
            return jsonify({'error': 'Archivo zones.json no encontrado'}), 404
        with open('zones.json', 'r', encoding='utf-8') as f:
            config = json.load(f)
        return jsonify(config), 200
    except json.JSONDecodeError as e:
        return jsonify({'error': f'Error al decodificar JSON: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Error al leer el archivo: {str(e)}'}), 500


@config_bp.route('/zones', methods=['PUT'])
def update_zones():
    try:
        data = request.get_json()
        if not isinstance(data, dict):
            return jsonify({'error': 'Formato inválido, se esperaba un objeto JSON'}), 400
        with open('zones.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@config_bp.route('/database', methods=['GET'])
def get_database():
    try:
        if os.path.exists('database.txt'):
            with open('database.txt', 'r') as f:
                db_path = f.read().strip()
            return jsonify({'path': db_path}), 200
        return jsonify({'path': ''}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@config_bp.route('/database', methods=['POST'])
def update_database():
    try:
        data = request.get_json()
        new_path = (data.get('path') or '').strip()
        if not new_path:
            return jsonify({'error': 'La ruta no puede estar vacía'}), 400
        with open('database.txt', 'w') as f:
            f.write(new_path)
        from utils.database import reset_db_path
        reset_db_path()
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@config_bp.route('/state/export', methods=['GET'])
def export_order_state():
    """Exporta el estado persistente de órdenes para backup"""
    try:
        from main_api import order_service
        
        state_json = order_service.state_manager.export_state()
        state_path = order_service.state_manager.get_state_file_path()
        
        return jsonify({
            'success': True,
            'data': json.loads(state_json),
            'file_path': state_path
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@config_bp.route('/state/import', methods=['POST'])
def import_order_state():
    """Restaura el estado persistente de órdenes desde un backup"""
    try:
        from main_api import order_service
        
        data = request.get_json()
        state_json = data.get('data')
        
        if not state_json:
            return jsonify({'error': 'No se proporcionaron datos de estado'}), 400
        
        # Convertir a JSON string si es dict
        if isinstance(state_json, dict):
            state_json = json.dumps(state_json)
        
        success = order_service.state_manager.import_state(state_json)
        
        if success:
            return jsonify({'success': True, 'message': 'Estado restaurado correctamente'}), 200
        else:
            return jsonify({'error': 'Formato de estado inválido'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@config_bp.route('/state/clear-delivered', methods=['POST'])
def clear_delivered_orders():
    """Limpia manualmente todas las órdenes con estado DELIVERED"""
    try:
        from main_api import order_service
        
        order_service.state_manager.clear_all_delivered()
        
        return jsonify({
            'success': True,
            'message': 'Órdenes entregadas eliminadas correctamente'
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
