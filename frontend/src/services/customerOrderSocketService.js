import { io } from 'socket.io-client';

export const CUSTOMER_ORDER_STATUS_EVENT = 'customer:order:status-updated';

const apiBaseUrl = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:5000/api';
const customerNamespaceUrl = `${new URL(apiBaseUrl).origin}/customer`;

export function createCustomerOrderSocket({
  tableNumber,
  orderId,
  token,
  trackingToken,
}) {
  const auth = trackingToken
    ? { orderId, trackingToken }
    : { tableNumber, orderId, token };

  return io(customerNamespaceUrl, {
    auth,
    autoConnect: false,
    reconnection: true,
  });
}
