import { motion, AnimatePresence } from 'framer-motion';
import type { Order } from '../utils/types';
import { useMemo } from 'react';

interface Props {
    orders: Order[];
    notificationFilter: string;
    onClose: () => void;
}

export default function ProductionSummaryModal({ orders, notificationFilter, onClose }: Props) {
    const summary = useMemo(() => {
        const itemMap = new Map<string, number>();

        orders.forEach(order => {
            order.ordertransactions.forEach(trans => {
                // Filter for "PREPARING" items
                if (trans.Status !== 'PREPARING') return;

                // Exclude cancelled/special notification items if needed (0 or 1 based on KDS logic)
                if (trans.MenuItemNotification === '0' || trans.MenuItemNotification === '1') return;

                // Filter by notification zone if not 'all'
                if (notificationFilter !== 'all' && trans.MenuItemNotification !== notificationFilter) return;

                const currentQty = itemMap.get(trans.MenuItemText) || 0;
                itemMap.set(trans.MenuItemText, currentQty + trans.Quantity);
            });
        });

        // Convert map to array and sort by quantity descending
        return Array.from(itemMap.entries())
            .map(([name, quantity]) => ({ name, quantity }))
            .sort((a, b) => b.quantity - a.quantity);
    }, [orders, notificationFilter]);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
                onClick={onClose}
            >
                <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-[90vw] max-h-[90vh] flex flex-col overflow-hidden">
                    <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900">
                        <div>
                            <h2 className="text-2xl font-bold text-white">Resumen de Producción</h2>
                            <p className="text-gray-400 text-sm mt-1">
                                {notificationFilter === 'all'
                                    ? 'Todas las zonas'
                                    : `Zona: ${notificationFilter === '2' ? 'Cocina' : notificationFilter === '3' ? 'Bar' : notificationFilter}`}
                                {' • '}
                                Mostrando ítems en preparación
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="p-6 overflow-y-auto flex-1 bg-gray-950/50">
                        {summary.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl bg-gray-900/50">
                                <span className="text-xl font-semibold mb-2">Sin producción pendiente</span>
                                <span className="text-sm">No hay ítems en preparación para esta zona.</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                {summary.map((item) => (
                                    <div
                                        key={item.name}
                                        className="bg-gray-900 p-4 rounded-xl border border-gray-800 flex items-center justify-between group hover:border-blue-500/50 transition-all"
                                    >
                                        <div className="flex-1 pr-4">
                                            <span className="text-gray-300 font-medium block truncate" title={item.name}>{item.name}</span>
                                            <span className="text-xs text-gray-500 uppercase tracking-wider">Cantidad</span>
                                        </div>
                                        <div className="bg-blue-600/20 text-blue-400 px-4 py-2 rounded-lg font-bold text-2xl min-w-[3.5rem] text-center border border-blue-600/30 shadow-[0_0_15px_rgba(37,99,235,0.1)]">
                                            {item.quantity}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-gray-900 border-t border-gray-800 flex justify-center">
                        <span className="px-3 py-1 bg-gray-800 rounded text-xs text-gray-500 font-mono">
                            Presiona <span className="text-white font-bold">.</span> o <span className="text-white font-bold">Esc</span> para cerrar
                        </span>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
