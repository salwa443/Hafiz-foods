import apiClient from './apiClient.js';

export async function loginStaff(credentials) {
  const response = await apiClient.post('/auth/login', credentials);
  return response.data.data;
}

export async function getCurrentStaffUser() {
  const response = await apiClient.get('/auth/me');
  return response.data.data.user;
}

export async function logoutStaff() {
  await apiClient.post('/auth/logout');
}
