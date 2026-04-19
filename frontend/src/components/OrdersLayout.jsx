function OrdersLayout({ children }) {
  return (
    <section className="w-full">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-white uppercase tracking-tight">
          Pedidos en cocina
        </h2>
        <p className="text-gray-400 text-sm">
          Monitorea el flujo de preparación y el estado de cada orden en tiempo real.
        </p>
      </div>
      <div className="w-full">{children}</div>
    </section>
  )
}

export default OrdersLayout
