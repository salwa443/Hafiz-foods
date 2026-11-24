import KitchenOrderCard from './KitchenOrderCard.jsx';

function KitchenOrderGrid({ orders, pendingOrderIds, actionErrors, onChangeStatus }) {
  if (orders.length === 0) {
    return (
      <div className="kitchen-empty-state">
        <h3>No active orders</h3>
        <p>New customer orders will appear here automatically.</p>
      </div>
    );
  }

  return (
    <div className="kitchen-order-grid">
      {orders.map((order) => (
        <KitchenOrderCard
          key={order.orderId}
          order={order}
          isPending={pendingOrderIds.includes(order.orderId)}
          actionError={actionErrors[order.orderId]}
          onChangeStatus={onChangeStatus}
        />
      ))}
    </div>
  );
}

export default KitchenOrderGrid;
