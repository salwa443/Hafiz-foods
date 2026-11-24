import { getSocketServer, SOCKET_EVENTS, WAITER_SOCKET_ROOM } from '../realtime/socketServer.js';

export function publishWaiterOrder(eventName, order, socketServer = getSocketServer()) {
  if (!socketServer) return false;
  try {
    socketServer.to(WAITER_SOCKET_ROOM).emit(eventName, order);
    return true;
  } catch {
    return false;
  }
}

export function publishWaiterReadyOrder(order, socketServer) {
  return publishWaiterOrder(SOCKET_EVENTS.WAITER_ORDER_READY, order, socketServer);
}

export function publishWaiterOrderUpdated(order, socketServer) {
  return publishWaiterOrder(SOCKET_EVENTS.WAITER_ORDER_UPDATED, order, socketServer);
}
