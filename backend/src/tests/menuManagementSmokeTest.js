import { closePool, query } from '../config/db.js';
import { env } from '../config/env.js';

const apiBaseUrl = `http://localhost:${env.port}/api`;
const results = [];

function record(test, passed, detail = '') {
  results.push({ test, status: passed ? 'PASS' : 'FAIL', detail });
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { response, body };
}

async function login(email) {
  const { response, body } = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: 'StrongPassword123',
    }),
  });

  if (!response.ok) {
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  }

  return body.data.token;
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function runMenuManagementTests() {
  const adminToken = await login('auth.admin@example.com');
  const kitchenToken = await login('auth.kitchen@example.com');
  const waiterToken = await login('auth.waiter@example.com');

  const categoryName = `Smoke Category ${Date.now()}`;
  const createCategory = await request('/admin/categories', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      name: categoryName,
      description: 'Created by menu management smoke test.',
      displayOrder: 20,
    }),
  });
  const category = createCategory.body?.data?.category;
  record('admin creates category', createCategory.response.status === 201, `HTTP ${createCategory.response.status}`);

  const updateCategory = await request(`/admin/categories/${category.id}`, {
    method: 'PUT',
    headers: bearer(adminToken),
    body: JSON.stringify({
      name: `${categoryName} Updated`,
      description: 'Updated by smoke test.',
      displayOrder: 21,
    }),
  });
  record('admin updates category', updateCategory.response.status === 200, `HTTP ${updateCategory.response.status}`);

  const createMenuItem = await request('/admin/menu-items', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      categoryId: category.id,
      name: `Smoke Burger ${Date.now()}`,
      description: 'Smoke-tested item.',
      price: 999.5,
      imageUrl: '/uploads/menu/sample.webp',
      isAvailable: true,
    }),
  });
  const menuItem = createMenuItem.body?.data?.menuItem;
  record(
    'admin creates menu item with image_url',
    createMenuItem.response.status === 201 &&
      Boolean(menuItem?.image_url) &&
      menuItem.image_url === '/uploads/menu/sample.webp',
    `HTTP ${createMenuItem.response.status}`
  );

  const getMenuItem = await request(`/admin/menu-items/${menuItem.id}`, {
    headers: bearer(adminToken),
  });
  record('admin gets menu item by id', getMenuItem.response.status === 200, `HTTP ${getMenuItem.response.status}`);

  const updateMenuItem = await request(`/admin/menu-items/${menuItem.id}`, {
    method: 'PUT',
    headers: bearer(adminToken),
    body: JSON.stringify({
      categoryId: category.id,
      name: `${menuItem.name} Updated`,
      description: 'Updated item.',
      price: 1001.25,
      imageUrl: '/uploads/menu/updated.png',
      isAvailable: true,
    }),
  });
  const updatedMenuItem = updateMenuItem.body?.data?.menuItem;
  record(
    'admin updates menu item and image_url',
    updateMenuItem.response.status === 200 &&
      updatedMenuItem?.image_url === '/uploads/menu/updated.png',
    `HTTP ${updateMenuItem.response.status}`
  );

  const unavailable = await request(`/admin/menu-items/${menuItem.id}/availability`, {
    method: 'PATCH',
    headers: bearer(adminToken),
    body: JSON.stringify({ isAvailable: false }),
  });
  record(
    'admin marks item unavailable',
    unavailable.response.status === 200 &&
      unavailable.body?.data?.menuItem?.is_available === false,
    `HTTP ${unavailable.response.status}`
  );

  const invalidPrice = await request('/admin/menu-items', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      categoryId: category.id,
      name: `Invalid Price ${Date.now()}`,
      price: -5,
      isAvailable: true,
    }),
  });
  record('negative price rejected', invalidPrice.response.status === 400, `HTTP ${invalidPrice.response.status}`);

  const invalidCategory = await request('/admin/menu-items', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      categoryId: 999999999,
      name: `Invalid Category ${Date.now()}`,
      price: 10,
      isAvailable: true,
    }),
  });
  record('invalid category id rejected', invalidCategory.response.status === 400, `HTTP ${invalidCategory.response.status}`);

  const deactivateCategory = await request(`/admin/categories/${category.id}/deactivate`, {
    method: 'PATCH',
    headers: bearer(adminToken),
  });
  record('admin deactivates category softly', deactivateCategory.response.status === 200, `HTTP ${deactivateCategory.response.status}`);

  const itemStillActiveResult = await query('SELECT is_active FROM menu_items WHERE id = $1', [
    menuItem.id,
  ]);
  record(
    'category deactivation does not deactivate item',
    itemStillActiveResult.rows[0]?.is_active === true,
    `item active=${itemStillActiveResult.rows[0]?.is_active}`
  );

  const inactiveCategoryCreate = await request('/admin/menu-items', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      categoryId: category.id,
      name: `Inactive Category Item ${Date.now()}`,
      price: 10,
      isAvailable: true,
    }),
  });
  record(
    'inactive category assignment rejected',
    inactiveCategoryCreate.response.status === 400,
    `HTTP ${inactiveCategoryCreate.response.status}`
  );

  const deactivateItem = await request(`/admin/menu-items/${menuItem.id}/deactivate`, {
    method: 'PATCH',
    headers: bearer(adminToken),
  });
  record('admin deactivates menu item softly', deactivateItem.response.status === 200, `HTTP ${deactivateItem.response.status}`);

  const activeList = await request('/admin/menu-items', {
    headers: bearer(adminToken),
  });
  const activeMenuItems = activeList.body?.data?.menuItems || [];
  record(
    'inactive items excluded from normal listings',
    activeList.response.status === 200 &&
      !activeMenuItems.some((item) => item.id === menuItem.id),
    `HTTP ${activeList.response.status}`
  );

  const unauthorized = await request('/admin/menu-items', {
    headers: bearer(kitchenToken),
  });
  record('kitchen cannot access admin menu APIs', unauthorized.response.status === 403, `HTTP ${unauthorized.response.status}`);

  const waiterAccess = await request('/admin/menu-items', {
    headers: bearer(waiterToken),
  });
  record('waiter cannot access admin menu APIs', waiterAccess.response.status === 403, `HTTP ${waiterAccess.response.status}`);

  const unauthenticated = await request('/admin/menu-items');
  record('missing token rejected', unauthenticated.response.status === 401, `HTTP ${unauthenticated.response.status}`);
}

runMenuManagementTests()
  .catch((error) => {
    record('menu management smoke test runner', false, error.message);
  })
  .finally(async () => {
    console.table(results);
    const failed = results.filter((result) => result.status === 'FAIL');
    await closePool();

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  });
