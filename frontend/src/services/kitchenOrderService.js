import apiClient from './apiClient.js';

export async function getActiveKitchenOrders(options = {}) {
  const response = await apiClient.get('/kitchen/orders/active', {
    signal: options.signal,
  });

  return response.data.data.orders;
}

export async function updateKitchenOrderStatus(orderId, status, client = apiClient) {
  const response = await client.patch(
    `/kitchen/orders/${encodeURIComponent(orderId)}/status`,
    { status }
  );

  return response.data.data.order;
}
