import apiClient from './apiClient.js';

function buildMenuItemFormData(payload) {
  const formData = new FormData();

  formData.append('categoryId', payload.categoryId);
  formData.append('name', payload.name);
  formData.append('description', payload.description || '');
  formData.append('price', payload.price);
  formData.append('isAvailable', payload.isAvailable);

  if (payload.image) {
    formData.append('image', payload.image);
  }

  return formData;
}

export async function getMenuItems({ includeInactive = false } = {}) {
  const response = await apiClient.get('/admin/menu-items', {
    params: { includeInactive },
  });
  return response.data.data.menuItems;
}

export async function createMenuItem(payload) {
  const response = await apiClient.post(
    '/admin/menu-items',
    buildMenuItemFormData(payload)
  );
  return response.data.data.menuItem;
}

export async function updateMenuItem(id, payload) {
  const response = await apiClient.put(
    `/admin/menu-items/${id}`,
    buildMenuItemFormData(payload)
  );
  return response.data.data.menuItem;
}

export async function updateMenuItemAvailability(id, isAvailable) {
  const response = await apiClient.patch(`/admin/menu-items/${id}/availability`, {
    isAvailable,
  });
  return response.data.data.menuItem;
}

export async function deactivateMenuItem(id) {
  const response = await apiClient.patch(`/admin/menu-items/${id}/deactivate`);
  return response.data.data.menuItem;
}
