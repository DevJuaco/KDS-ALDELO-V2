import { useMemo } from 'react';

export default function ProductionSummaryModal({ orders, notificationFilter, onClose }) {
    const summary = useMemo(() => {
        const itemMap = new Map();

        orders.forEach(order => {
            order.ordertransactions.forEach(trans => {
                if (trans.Status !== 'PREPARING') return;
                if (trans.MenuItemNotification === '0' || trans.MenuItemNotification === '1') return;
                if (notificationFilter !== 'all' && trans.MenuItemNotification !== notificationFilter) return;

                const currentQty = itemMap.get(trans.MenuItemText) || 0;
                itemMap.set(trans.MenuItemText, currentQty + trans.Quantity);
            });
        });

        return Array.from(itemMap.entries())
            .map(([name, quantity]) => ({ name, quantity }))
            .sort((a, b) => b.quantity - a.quantity);
    }, [orders, notificationFilter]);

    return (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-md" onClick={onClose}>
            <div 
                className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-white/10"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-8 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tight uppercase">Resumen de Producción</h2>
                        <p className="text-zinc-400 font-bold text-sm mt-1 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                            {notificationFilter === 'all'
                                ? 'Todas las zonas'
                                : `Zona: ${notificationFilter === '2' ? 'Cocina' : notificationFilter === '3' ? 'Bar' : notificationFilter}`}
                            {' • '}
                            Items en preparación
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-zinc-400 hover:text-white transition-all shadow-lg active:scale-90"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-8 overflow-y-auto flex-1 bg-zinc-950/50 custom-scrollbar">
                    {summary.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-80 text-zinc-600 border-2 border-dashed border-zinc-800 rounded-3xl bg-zinc-900/30">
                            <svg className="w-20 h-20 opacity-20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <span className="text-2xl font-bold italic tracking-tight">Sin producción pendiente</span>
                            <span className="text-sm font-medium mt-2">No hay ítems registrados en esta zona de preparación.</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                            {summary.map((item) => (
                                <div
                                    key={item.name}
                                    className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 flex items-center justify-between group hover:border-blue-500/50 transition-all shadow-lg hover:shadow-blue-500/10"
                                >
                                    <div className="flex-1 pr-4">
                                        <span className="text-zinc-400 font-bold uppercase text-[10px] tracking-widest block mb-1">Producto</span>
                                        <span className="text-white font-black text-lg block truncate leading-tight" title={item.name}>{item.name}</span>
                                    </div>
                                    <div className="bg-blue-600/10 text-blue-400 px-4 py-3 rounded-xl font-black text-3xl min-w-[4rem] text-center border border-blue-600/30 shadow-[0_0_20px_rgba(37,99,235,0.15)] group-hover:bg-blue-600 group-hover:text-white transition-all">
                                        {item.quantity}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-6 bg-zinc-900 border-t border-zinc-800 flex justify-center shadow-[0_-10px_30px_rgba(0,0,0,0.3)]">
                    <span className="px-6 py-2 bg-zinc-950 rounded-full text-xs text-zinc-500 font-black uppercase tracking-[0.2em] flex items-center gap-3 border border-zinc-800/50">
                        Presiona <span className="text-white bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700 shadow-sm">.</span> o <span className="text-white bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700 shadow-sm">Esc</span> para cerrar
                    </span>
                </div>
            </div>
        </div>
    );
}
