import { KITCHEN_SOCKET_EVENTS } from '../services/kitchenSocketEvents.js';

const ACTIVE_STATUSES = new Set(['new', 'accepted', 'preparing', 'ready']);

export function mergeKitchenOrders(...orderCollections) {
  const ordersById = new Map();

  orderCollections.flat().forEach((order) => {
    if (order?.orderId) {
      ordersById.set(order.orderId, order);
    }
  });

  return [...ordersById.values()].filter((order) => ACTIVE_STATUSES.has(order.status)).sort((first, second) => {
    const timeDifference = new Date(first.orderTime).getTime() - new Date(second.orderTime).getTime();
    return timeDifference || first.orderId.localeCompare(second.orderId);
  });
}

export function applyKitchenOrderStatusUpdate(orders, update) {
  const existing = orders.find((order) => order.orderId === update?.orderId);

  if (!update?.orderId) return orders;

  const mergedUpdate = {
    ...existing,
    ...update,
    items: update.items ?? existing?.items ?? [],
  };

  return mergeKitchenOrders(
    orders.filter((order) => order.orderId !== update.orderId),
    [mergedUpdate]
  );
}

function getActionErrorMessage(error) {
  if (error?.response?.status === 409) {
    return 'This order changed in another kitchen session. The latest orders were reloaded.';
  }

  return error?.response?.data?.message ||
    'We could not update this order. Please try again.';
}

export function createKitchenOrderSession({
  socket,
  loadOrders,
  updateOrderStatus,
  onStateChange,
}) {
  let state = {
    orders: [],
    isLoading: true,
    error: '',
    connectionStatus: 'connecting',
    pendingOrderIds: [],
    actionErrors: {},
  };
  let isSynchronizing = false;
  let bufferedOrders = [];
  let syncAfterConnection = false;
  let isStopped = false;

  function publishState(updates = {}) {
    if (isStopped) return;
    state = { ...state, ...updates };
    onStateChange({ ...state, orders: [...state.orders] });
  }

  async function synchronize() {
    if (isSynchronizing || isStopped) return;

    isSynchronizing = true;
    bufferedOrders = [];
    publishState({ isLoading: state.orders.length === 0, error: '' });

    try {
      const activeOrders = await loadOrders();
      publishState({
        orders: mergeKitchenOrders(activeOrders, bufferedOrders),
        isLoading: false,
        error: '',
      });
    } catch {
      publishState({
        orders: mergeKitchenOrders(state.orders, bufferedOrders),
        isLoading: false,
        error: 'We could not load active kitchen orders. Please try again.',
      });
    } finally {
      bufferedOrders = [];
      isSynchronizing = false;
      if (syncAfterConnection) {
        syncAfterConnection = false;
        void synchronize();
      }
    }
  }

  function handleNewOrder(order) {
    if (isSynchronizing) {
      bufferedOrders.push(order);
      return;
    }

    publishState({ orders: mergeKitchenOrders(state.orders, [order]) });
  }

  function handleStatusUpdate(order) {
    if (isSynchronizing) {
      bufferedOrders.push(order);
      return;
    }

    publishState({
      orders: applyKitchenOrderStatusUpdate(state.orders, order),
      actionErrors: Object.fromEntries(
        Object.entries(state.actionErrors).filter(([orderId]) => orderId !== order.orderId)
      ),
    });
  }

  function handleConnect() {
    publishState({ connectionStatus: 'connected' });

    if (isSynchronizing) {
      syncAfterConnection = true;
    } else {
      void synchronize();
    }
  }

  function handleConnectError() {
    publishState({ connectionStatus: 'error' });
  }

  function handleDisconnect() {
    publishState({ connectionStatus: 'disconnected' });
  }

  return {
    start() {
      socket.on(KITCHEN_SOCKET_EVENTS.ORDER_NEW, handleNewOrder);
      socket.on(KITCHEN_SOCKET_EVENTS.ORDER_STATUS_UPDATED, handleStatusUpdate);
      socket.on('connect', handleConnect);
      socket.on('connect_error', handleConnectError);
      socket.on('disconnect', handleDisconnect);
      synchronize();
      socket.connect();
    },
    retry: synchronize,
    async changeStatus(orderId, targetStatus) {
      if (isStopped || state.pendingOrderIds.includes(orderId)) return false;

      publishState({
        pendingOrderIds: [...state.pendingOrderIds, orderId],
        actionErrors: Object.fromEntries(
          Object.entries(state.actionErrors).filter(([key]) => key !== orderId)
        ),
      });

      try {
        const updatedOrder = await updateOrderStatus(orderId, targetStatus);
        publishState({
          orders: applyKitchenOrderStatusUpdate(state.orders, updatedOrder),
        });
        return true;
      } catch (error) {
        publishState({
          actionErrors: {
            ...state.actionErrors,
            [orderId]: getActionErrorMessage(error),
          },
        });
        await synchronize();
        return false;
      } finally {
        publishState({
          pendingOrderIds: state.pendingOrderIds.filter((id) => id !== orderId),
        });
      }
    },
    stop() {
      isStopped = true;
      socket.off(KITCHEN_SOCKET_EVENTS.ORDER_NEW, handleNewOrder);
      socket.off(KITCHEN_SOCKET_EVENTS.ORDER_STATUS_UPDATED, handleStatusUpdate);
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('disconnect', handleDisconnect);
      socket.disconnect();
    },
  };
}
