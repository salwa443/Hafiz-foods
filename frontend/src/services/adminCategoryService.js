import apiClient from './apiClient.js';

export async function getAdminSummary() {
  const response = await apiClient.get('/admin/categories/summary');
  return response.data.data;
}

export async function getCategories({ includeInactive = true } = {}) {
  const response = await apiClient.get('/admin/categories', {
    params: { includeInactive },
  });
  return response.data.data.categories;
}

export async function createCategory(payload) {
  const response = await apiClient.post('/admin/categories', payload);
  return response.data.data.category;
}

export async function updateCategory(id, payload) {
  const response = await apiClient.put(`/admin/categories/${id}`, payload);
  return response.data.data.category;
}

export async function deactivateCategory(id) {
  const response = await apiClient.patch(`/admin/categories/${id}/deactivate`);
  return response.data.data.category;
}
