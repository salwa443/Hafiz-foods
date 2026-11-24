import { CUSTOMER_ORDER_STATUS_EVENT } from '../services/customerOrderSocketService.js';

const STATUS_RANK = Object.freeze({
  new: 0,
  accepted: 1,
  preparing: 2,
  ready: 3,
  completed: 4,
});

export function canCancelCustomerOrder(status) {
  return status === 'new';
}

export function applyCustomerOrderStatusEvent(currentOrder, event) {
  if (!currentOrder || event?.orderId !== currentOrder.orderId) return currentOrder;
  if (currentOrder.status === 'cancelled' || currentOrder.status === 'completed') {
    return currentOrder;
  }

  if (event.status === 'cancelled') {
    return { ...currentOrder, status: 'cancelled', updatedAt: event.updatedAt };
  }

  const currentRank = STATUS_RANK[currentOrder.status];
  const nextRank = STATUS_RANK[event.status];

  if (nextRank === undefined || nextRank < currentRank) return currentOrder;

  if (
    nextRank === currentRank &&
    currentOrder.updatedAt &&
    event.updatedAt &&
    new Date(event.updatedAt).getTime() < new Date(currentOrder.updatedAt).getTime()
  ) {
    return currentOrder;
  }

  return {
    ...currentOrder,
    status: event.status,
    updatedAt: event.updatedAt,
  };
}

function cancellationErrorMessage(error) {
  if (error?.response?.status === 409) {
    return 'The kitchen accepted this order before it could be cancelled. The last confirmed status is shown while live updates continue.';
  }

  if (error?.response?.status === 404) {
    return 'This QR code can no longer authorize cancellation. Please ask a staff member for help.';
  }

  if (!error?.response) {
    return 'We could not confirm whether cancellation succeeded. Please ask a staff member before trying again.';
  }

  return 'This order could not be cancelled. Please ask a staff member for help.';
}

export function createCustomerOrderStatusSession({
  socket,
  initialOrder,
  cancelOrder,
  onStateChange,
}) {
  let state = {
    order: initialOrder,
    connectionStatus: 'connecting',
    isCancelling: false,
    cancellationError: '',
  };
  let cancellationPending = false;
  let stopped = false;

  function publish(updates) {
    if (stopped) return;
    state = { ...state, ...updates };
    onStateChange({ ...state, order: { ...state.order } });
  }

  function handleStatusUpdate(event) {
    const nextOrder = applyCustomerOrderStatusEvent(state.order, event);
    if (nextOrder !== state.order) {
      publish({ order: nextOrder, cancellationError: '' });
    }
  }

  function handleConnect() {
    publish({ connectionStatus: 'connected' });
  }

  function handleDisconnect() {
    publish({ connectionStatus: 'disconnected' });
  }

  function handleConnectError() {
    publish({ connectionStatus: 'error' });
  }

  return {
    start() {
      socket.on(CUSTOMER_ORDER_STATUS_EVENT, handleStatusUpdate);
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      socket.on('connect_error', handleConnectError);
      socket.connect();
    },
    async cancel() {
      if (
        stopped ||
        cancellationPending ||
        !canCancelCustomerOrder(state.order.status)
      ) {
        return false;
      }

      cancellationPending = true;
      publish({ isCancelling: true, cancellationError: '' });

      try {
        const cancelledOrder = await cancelOrder();
        publish({
          order: applyCustomerOrderStatusEvent(state.order, cancelledOrder),
          cancellationError: '',
        });
        return true;
      } catch (error) {
        publish({ cancellationError: cancellationErrorMessage(error) });
        return false;
      } finally {
        cancellationPending = false;
        publish({ isCancelling: false });
      }
    },
    stop() {
      stopped = true;
      socket.off(CUSTOMER_ORDER_STATUS_EVENT, handleStatusUpdate);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.disconnect();
    },
  };
}
