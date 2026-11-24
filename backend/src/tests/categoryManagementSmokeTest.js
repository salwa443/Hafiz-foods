import { closePool } from '../config/db.js';
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

async function runCategoryTests() {
  const adminToken = await login('auth.admin@example.com');
  const kitchenToken = await login('auth.kitchen@example.com');
  const waiterToken = await login('auth.waiter@example.com');
  const categoryName = `Category Smoke ${Date.now()}`;

  const listCategories = await request('/admin/categories', {
    headers: bearer(adminToken),
  });
  record('admin lists categories', listCategories.response.status === 200, `HTTP ${listCategories.response.status}`);

  const createCategory = await request('/admin/categories', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      name: categoryName,
      description: 'Created by category smoke test.',
      displayOrder: 30,
    }),
  });
  const category = createCategory.body?.data?.category;
  record('admin creates category', createCategory.response.status === 201 && Boolean(category?.id), `HTTP ${createCategory.response.status}`);

  const getCategory = await request(`/admin/categories/${category.id}`, {
    headers: bearer(adminToken),
  });
  record('admin gets category by id', getCategory.response.status === 200, `HTTP ${getCategory.response.status}`);

  const updateCategory = await request(`/admin/categories/${category.id}`, {
    method: 'PUT',
    headers: bearer(adminToken),
    body: JSON.stringify({
      name: `${categoryName} Updated`,
      description: 'Updated by category smoke test.',
      displayOrder: 31,
    }),
  });
  record('admin updates category', updateCategory.response.status === 200, `HTTP ${updateCategory.response.status}`);

  const duplicateCategory = await request('/admin/categories', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      name: `${categoryName} Updated`,
      displayOrder: 32,
    }),
  });
  record('duplicate category name rejected', duplicateCategory.response.status === 409, `HTTP ${duplicateCategory.response.status}`);

  const missingName = await request('/admin/categories', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      name: '',
      displayOrder: 1,
    }),
  });
  record('missing category name rejected', missingName.response.status === 400, `HTTP ${missingName.response.status}`);

  const negativeDisplayOrder = await request('/admin/categories', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      name: `Negative Order ${Date.now()}`,
      displayOrder: -1,
    }),
  });
  record('negative display order rejected', negativeDisplayOrder.response.status === 400, `HTTP ${negativeDisplayOrder.response.status}`);

  const invalidId = await request('/admin/categories/not-a-number', {
    headers: bearer(adminToken),
  });
  record('invalid category id rejected', invalidId.response.status === 400, `HTTP ${invalidId.response.status}`);

  const missingCategory = await request('/admin/categories/999999999', {
    headers: bearer(adminToken),
  });
  record('missing category returns 404', missingCategory.response.status === 404, `HTTP ${missingCategory.response.status}`);

  const deactivateCategory = await request(`/admin/categories/${category.id}/deactivate`, {
    method: 'PATCH',
    headers: bearer(adminToken),
  });
  record(
    'admin deactivates category softly',
    deactivateCategory.response.status === 200 &&
      deactivateCategory.body?.data?.category?.is_active === false,
    `HTTP ${deactivateCategory.response.status}`
  );

  const kitchenAccess = await request('/admin/categories', {
    headers: bearer(kitchenToken),
  });
  record('kitchen cannot access category APIs', kitchenAccess.response.status === 403, `HTTP ${kitchenAccess.response.status}`);

  const waiterAccess = await request('/admin/categories', {
    headers: bearer(waiterToken),
  });
  record('waiter cannot access category APIs', waiterAccess.response.status === 403, `HTTP ${waiterAccess.response.status}`);

  const missingToken = await request('/admin/categories');
  record('missing token rejected', missingToken.response.status === 401, `HTTP ${missingToken.response.status}`);
}

runCategoryTests()
  .catch((error) => {
    record('category smoke test runner', false, error.message);
  })
  .finally(async () => {
    console.table(results);
    const failed = results.filter((result) => result.status === 'FAIL');
    await closePool();

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  });
