import apiClient from './apiClient.js';

export async function placeCustomerOrder(tableNumber, qrToken, orderPayload, options = {}) {
  const response = await apiClient.post(
    `/public/tables/${encodeURIComponent(tableNumber)}/orders`,
    orderPayload,
    {
      params: { token: qrToken },
      signal: options.signal,
    }
  );

  return response.data.data.order;
}

export async function getCustomerTrackedOrder(
  orderId,
  trackingToken,
  options = {},
  client = apiClient
) {
  const response = await client.get(
    `/public/orders/${encodeURIComponent(orderId)}/tracking`,
    {
      headers: {
        'X-Order-Tracking-Token': trackingToken,
      },
      signal: options.signal,
    }
  );

  return response.data.data.order;
}

export async function cancelCustomerOrder(
  tableNumber,
  orderId,
  credentials,
  options = {},
  client = apiClient
) {
  const response = await client.patch(
    `/public/tables/${encodeURIComponent(tableNumber)}/orders/${encodeURIComponent(orderId)}/cancel`,
    undefined,
    {
      headers: credentials?.trackingToken
        ? { 'X-Order-Tracking-Token': credentials.trackingToken }
        : undefined,
      params: credentials?.trackingToken
        ? undefined
        : { token: credentials?.qrToken },
      signal: options.signal,
    }
  );

  return response.data.data.order;
}
