export function mergeWaiterOrder(orders, order) {
  if (order.deliveryStatus === 'delivered') {
    return orders.filter((item) => item.orderId !== order.orderId);
  }

  return [...orders.filter((item) => item.orderId !== order.orderId), order]
    .sort((a, b) => new Date(a.readyAt) - new Date(b.readyAt));
}

export function getWaiterOrderAction(order, currentUserId) {
  if (!order.assignedWaiter) return 'claim';
  if (order.assignedWaiter.id !== currentUserId) return null;
  if (!order.pickedUpAt) return 'pickup';
  if (!order.deliveredAt) return 'deliver';
  return null;
}
