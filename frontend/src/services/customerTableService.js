import apiClient from './apiClient.js';

export async function validateCustomerTableAccess(tableNumber, token, options = {}) {
  const response = await apiClient.get(
    `/public/tables/${encodeURIComponent(tableNumber)}/access`,
    {
      params: { token },
      signal: options.signal,
    }
  );

  return response.data.data.table;
}
