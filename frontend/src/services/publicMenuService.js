import apiClient from './apiClient.js';

export async function getPublicCategories(options = {}) {
  const response = await apiClient.get('/public/menu/categories', {
    signal: options.signal,
  });

  return response.data.data.categories;
}

export async function getPublicMenuItems({ search, categoryId, signal } = {}) {
  const params = {};

  if (search) {
    params.search = search;
  }

  if (categoryId) {
    params.categoryId = categoryId;
  }

  const response = await apiClient.get('/public/menu/items', {
    params,
    signal,
  });

  return response.data.data.menuItems;
}
