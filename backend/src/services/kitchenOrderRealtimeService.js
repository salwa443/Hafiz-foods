import {
  KITCHEN_SOCKET_ROOM,
  SOCKET_EVENTS,
  getSocketServer,
} from '../realtime/socketServer.js';

export function buildKitchenOrderPayload(order) {
  return {
    orderId: order.orderId,
    tableNumber: order.tableNumber,
    tableDisplayLabel: order.tableDisplayLabel,
    orderTime: order.orderTime,
    status: order.status,
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      specialInstructions: item.specialInstructions,
    })),
  };
}

export function publishNewKitchenOrder(order) {
  try {
    const io = getSocketServer();

    if (!io) {
      return false;
    }

    io.to(KITCHEN_SOCKET_ROOM).emit(
      SOCKET_EVENTS.KITCHEN_ORDER_NEW,
      buildKitchenOrderPayload(order)
    );
    return true;
  } catch {
    // A real-time delivery failure must not turn a committed order into an HTTP failure.
    return false;
  }
}
