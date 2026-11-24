import apiClient from './apiClient.js';

export async function getTables({ includeInactive = false } = {}) {
  const response = await apiClient.get('/admin/tables', {
    params: { includeInactive },
  });
  return response.data.data.tables;
}

export async function createTable(payload) {
  const response = await apiClient.post('/admin/tables', payload);
  return response.data.data.table;
}

export async function updateTable(id, payload) {
  const response = await apiClient.put(`/admin/tables/${id}`, payload);
  return response.data.data.table;
}

export async function deactivateTable(id) {
  const response = await apiClient.patch(`/admin/tables/${id}/deactivate`);
  return response.data.data.table;
}

export async function reactivateTable(id) {
  const response = await apiClient.patch(`/admin/tables/${id}/reactivate`);
  return response.data.data.table;
}

export async function updateTableStatus(id, status) {
  const response = await apiClient.patch(`/admin/tables/${id}/status`, { status });
  return response.data.data.table;
}

export async function getTableQrInfo(id) {
  const response = await apiClient.get(`/admin/tables/${id}/qr`);
  return response.data.data.qr;
}

export async function generateTableQr(id) {
  const response = await apiClient.post(`/admin/tables/${id}/qr/generate`);
  return response.data.data.qr;
}

export async function regenerateTableQr(id) {
  const response = await apiClient.patch(`/admin/tables/${id}/qr/regenerate`);
  return response.data.data.qr;
}

export async function downloadTableQr(id) {
  const response = await apiClient.get(`/admin/tables/${id}/qr/download`, {
    responseType: 'blob',
  });
  return response.data;
}
