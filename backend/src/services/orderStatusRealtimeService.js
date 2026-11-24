import {
  KITCHEN_SOCKET_ROOM,
  CUSTOMER_SOCKET_NAMESPACE,
  SOCKET_EVENTS,
  buildCustomerOrderRoom,
  getSocketServer,
} from '../realtime/socketServer.js';
import { publishWaiterReadyOrder } from './waiterOrderRealtimeService.js';

export function buildKitchenOrderStatusPayload(order) {
  return {
    orderId: order.orderId,
    tableNumber: order.tableNumber,
    tableDisplayLabel: order.tableDisplayLabel,
    orderTime: order.orderTime,
    status: order.status,
    updatedAt: order.updatedAt,
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      specialInstructions: item.specialInstructions,
    })),
  };
}

export function buildCustomerOrderStatusPayload(order) {
  return {
    orderId: order.orderId,
    tableNumber: order.tableNumber,
    status: order.status,
    updatedAt: order.updatedAt,
  };
}

export function publishOrderStatusUpdated(order, socketServer = getSocketServer()) {
  if (!socketServer) {
    return { kitchenPublished: false, customerPublished: false };
  }

  let kitchenPublished = false;
  let customerPublished = false;

  try {
    socketServer
      .to(KITCHEN_SOCKET_ROOM)
      .emit(
        SOCKET_EVENTS.KITCHEN_ORDER_STATUS_UPDATED,
        buildKitchenOrderStatusPayload(order)
      );
    kitchenPublished = true;
  } catch {
    // A realtime failure must not change the result of a committed status update.
  }

  if (order.status === 'ready') {
    publishWaiterReadyOrder({
      orderId: order.orderId,
      tableNumber: order.tableNumber,
      tableDisplayLabel: order.tableDisplayLabel,
      readyAt: order.updatedAt,
      assignedWaiter: null,
      claimedAt: null,
      pickedUpAt: null,
      deliveredAt: null,
      deliveryStatus: 'ready',
      items: order.items,
    }, socketServer);
  }

  try {
    socketServer
      .of(CUSTOMER_SOCKET_NAMESPACE)
      .to(buildCustomerOrderRoom(order.orderId))
      .emit(
        SOCKET_EVENTS.CUSTOMER_ORDER_STATUS_UPDATED,
        buildCustomerOrderStatusPayload(order)
      );
    customerPublished = true;
  } catch {
    // Customer-room delivery is best effort until the authenticated namespace exists.
  }

  return { kitchenPublished, customerPublished };
}
