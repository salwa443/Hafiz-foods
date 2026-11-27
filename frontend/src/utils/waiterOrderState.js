export function mergeWaiterOrder(orders, order) {
  if (order.deliveryStatus === 'delivered') {
    return orders.filter((item) => item.orderId !== order.orderId);
  }

  return [...orders.filter((item) => item.orderId !== order.orderId), order]
    .sort((a, b) => new Date(a.readyAt) - new Date(b.readyAt));
}

export function createWaiterQueueSync({ loadOrders, onSnapshot, onUpdate, onLoading, onError }) {
  let request;
  let updates = [];
  let stopped = false;
  let refreshAfterLoad = false;

  function refresh({ afterConnection = false } = {}) {
    if (stopped) return;
    if (request) {
      refreshAfterLoad ||= afterConnection;
      return request;
    }

    onLoading(true);
    request = Promise.resolve().then(loadOrders).then((orders) => {
      if (stopped) return;
      onSnapshot(updates.reduce(mergeWaiterOrder, orders));
      onError('');
    }).catch(() => {
      if (!stopped) onError('Ready orders could not be loaded. Please try again.');
    }).finally(() => {
      request = null;
      updates = [];
      if (stopped) return;
      if (refreshAfterLoad) {
        refreshAfterLoad = false;
        return refresh();
      }
      onLoading(false);
    });

    return request;
  }

  return {
    refresh,
    receive(order) {
      if (stopped) return;
      if (request) updates.push(order);
      onUpdate(order);
    },
    stop() {
      stopped = true;
    },
  };
}

export function getWaiterOrderAction(order, currentUserId) {
  if (!order.assignedWaiter) return 'claim';
  if (order.assignedWaiter.id !== currentUserId) return null;
  if (!order.pickedUpAt) return 'pickup';
  if (!order.deliveredAt) return 'deliver';
  return null;
}
