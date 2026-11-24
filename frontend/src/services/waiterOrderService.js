import apiClient from './apiClient.js';

export async function getReadyWaiterOrders() {
  const response = await apiClient.get('/waiter/orders/ready');
  return response.data.data.orders;
}

export async function updateWaiterDelivery(orderId, action) {
  const response = await apiClient.patch(
    `/waiter/orders/${encodeURIComponent(orderId)}/${action}`
  );
  return response.data.data.order;
}
