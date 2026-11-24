import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { closePool, query } from '../config/db.js';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, '..', '..', 'uploads', 'menu');
const apiBaseUrl = `http://localhost:${env.port}/api`;
const serverBaseUrl = `http://localhost:${env.port}`;
const results = [];

function record(test, passed, detail = '') {
  results.push({ test, status: passed ? 'PASS' : 'FAIL', detail });
}

async function request(apiPath, options = {}) {
  const headers = options.body instanceof FormData
    ? options.headers || {}
    : {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };

  const response = await fetch(`${apiBaseUrl}${apiPath}`, {
    ...options,
    headers,
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

function pngFile(name = 'fr11-item.png') {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a,
    0x00,
  ]);

  return new File([bytes], name, { type: 'image/png' });
}

function webpFile(name = 'fr11-item.webp') {
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
    0x00,
  ]);

  return new File([bytes], name, { type: 'image/webp' });
}

function menuItemForm(fields, file) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, String(value));
  }

  if (file) {
    formData.append('image', file);
  }

  return formData;
}

function imagePathFromUrl(imageUrl) {
  return path.join(uploadRoot, path.basename(imageUrl));
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getDashboardSummary(token) {
  const summary = await request('/admin/categories/summary', {
    headers: bearer(token),
  });

  return summary;
}

async function getDatabaseSummary() {
  const result = await query(`
    SELECT
      (SELECT COUNT(*)::INTEGER FROM categories WHERE is_active = TRUE) AS active_categories,
      (SELECT COUNT(*)::INTEGER FROM menu_items WHERE is_active = TRUE) AS active_menu_items,
      (SELECT COUNT(*)::INTEGER FROM menu_items WHERE is_active = TRUE AND is_available = TRUE) AS available_menu_items,
      (SELECT COUNT(*)::INTEGER FROM menu_items WHERE is_active = TRUE AND is_available = FALSE) AS unavailable_menu_items
  `);

  return result.rows[0];
}

async function runFr11IntegrationTests() {
  const adminToken = await login('auth.admin@example.com');
  const kitchenToken = await login('auth.kitchen@example.com');
  const waiterToken = await login('auth.waiter@example.com');

  record('admin logs in', Boolean(adminToken));

  const dashboard = await getDashboardSummary(adminToken);
  const databaseSummary = await getDatabaseSummary();
  record(
    'admin dashboard summary matches database counts',
    dashboard.response.status === 200 &&
      dashboard.body?.data?.active_categories === databaseSummary.active_categories &&
      dashboard.body?.data?.active_menu_items === databaseSummary.active_menu_items &&
      dashboard.body?.data?.available_menu_items === databaseSummary.available_menu_items &&
      dashboard.body?.data?.unavailable_menu_items === databaseSummary.unavailable_menu_items,
    `HTTP ${dashboard.response.status}`
  );

  const categoryName = `FR11 Integration Category ${Date.now()}`;
  const createCategory = await request('/admin/categories', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      name: categoryName,
      description: 'Created during full FR-11 integration testing.',
      displayOrder: 61,
    }),
  });
  const category = createCategory.body?.data?.category;
  const createdCategoryDb = category
    ? await query('SELECT name, is_active FROM categories WHERE id = $1', [category.id])
    : { rows: [] };
  record(
    'admin creates category and database record exists',
    createCategory.response.status === 201 &&
      createdCategoryDb.rows[0]?.name === categoryName &&
      createdCategoryDb.rows[0]?.is_active === true,
    `HTTP ${createCategory.response.status}`
  );

  const updatedCategoryName = `${categoryName} Updated`;
  const editCategory = await request(`/admin/categories/${category.id}`, {
    method: 'PUT',
    headers: bearer(adminToken),
    body: JSON.stringify({
      name: updatedCategoryName,
      description: 'Updated during full FR-11 integration testing.',
      displayOrder: 62,
    }),
  });
  const editedCategoryDb = await query(
    'SELECT name, display_order FROM categories WHERE id = $1',
    [category.id]
  );
  record(
    'admin edits category and database record updates',
    editCategory.response.status === 200 &&
      editedCategoryDb.rows[0]?.name === updatedCategoryName &&
      editedCategoryDb.rows[0]?.display_order === 62,
    `HTTP ${editCategory.response.status}`
  );

  const deactivateCategory = await request(`/admin/categories/${category.id}/deactivate`, {
    method: 'PATCH',
    headers: bearer(adminToken),
  });
  const deactivatedCategoryDb = await query(
    'SELECT is_active FROM categories WHERE id = $1',
    [category.id]
  );
  record(
    'admin deactivates category softly',
    deactivateCategory.response.status === 200 &&
      deactivatedCategoryDb.rows[0]?.is_active === false,
    `HTTP ${deactivateCategory.response.status}`
  );

  const itemCategory = await request('/admin/categories', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      name: `FR11 Menu Item Category ${Date.now()}`,
      description: 'Active category for item integration testing.',
      displayOrder: 63,
    }),
  });
  const activeCategory = itemCategory.body?.data?.category;

  const itemName = `FR11 Integration Item ${Date.now()}`;
  const createMenuItem = await request('/admin/menu-items', {
    method: 'POST',
    headers: bearer(adminToken),
    body: menuItemForm(
      {
        categoryId: activeCategory.id,
        name: itemName,
        description: 'Created during full FR-11 integration testing.',
        price: 725.5,
        isAvailable: true,
      },
      pngFile()
    ),
  });
  const menuItem = createMenuItem.body?.data?.menuItem;
  const firstImageUrl = menuItem?.image_url;
  const createdItemDb = menuItem
    ? await query(
        'SELECT name, price, image_url, is_available, is_active FROM menu_items WHERE id = $1',
        [menuItem.id]
      )
    : { rows: [] };
  const firstImageExists = firstImageUrl ? await fileExists(imagePathFromUrl(firstImageUrl)) : false;
  const firstImageServed = firstImageUrl ? await fetch(`${serverBaseUrl}${firstImageUrl}`) : null;
  record(
    'admin creates menu item and uploads image',
    createMenuItem.response.status === 201 &&
      createdItemDb.rows[0]?.name === itemName &&
      Number(createdItemDb.rows[0]?.price) === 725.5 &&
      firstImageUrl?.startsWith('/uploads/menu/') &&
      firstImageExists &&
      firstImageServed?.status === 200,
    `HTTP ${createMenuItem.response.status}`
  );

  const updatedItemName = `${itemName} Updated`;
  const editMenuItem = await request(`/admin/menu-items/${menuItem.id}`, {
    method: 'PUT',
    headers: bearer(adminToken),
    body: menuItemForm(
      {
        categoryId: activeCategory.id,
        name: updatedItemName,
        description: 'Edited during full FR-11 integration testing.',
        price: 825.75,
        isAvailable: true,
      },
      webpFile()
    ),
  });
  const updatedMenuItem = editMenuItem.body?.data?.menuItem;
  const replacementImageUrl = updatedMenuItem?.image_url;
  const editedItemDb = await query(
    'SELECT name, price, image_url FROM menu_items WHERE id = $1',
    [menuItem.id]
  );
  const oldImageStillExists = await fileExists(imagePathFromUrl(firstImageUrl));
  const replacementImageExists = await fileExists(imagePathFromUrl(replacementImageUrl));
  const replacementImageServed = await fetch(`${serverBaseUrl}${replacementImageUrl}`);
  record(
    'admin edits item details, price and replaces image',
    editMenuItem.response.status === 200 &&
      editedItemDb.rows[0]?.name === updatedItemName &&
      Number(editedItemDb.rows[0]?.price) === 825.75 &&
      replacementImageUrl?.startsWith('/uploads/menu/') &&
      replacementImageUrl !== firstImageUrl &&
      oldImageStillExists === false &&
      replacementImageExists &&
      replacementImageServed.status === 200,
    `HTTP ${editMenuItem.response.status}`
  );

  const unavailable = await request(`/admin/menu-items/${menuItem.id}/availability`, {
    method: 'PATCH',
    headers: bearer(adminToken),
    body: JSON.stringify({ isAvailable: false }),
  });
  const unavailableDb = await query('SELECT is_available FROM menu_items WHERE id = $1', [
    menuItem.id,
  ]);
  record(
    'admin marks item unavailable',
    unavailable.response.status === 200 && unavailableDb.rows[0]?.is_available === false,
    `HTTP ${unavailable.response.status}`
  );

  const available = await request(`/admin/menu-items/${menuItem.id}/availability`, {
    method: 'PATCH',
    headers: bearer(adminToken),
    body: JSON.stringify({ isAvailable: true }),
  });
  const availableDb = await query('SELECT is_available FROM menu_items WHERE id = $1', [
    menuItem.id,
  ]);
  record(
    'admin marks item available again',
    available.response.status === 200 && availableDb.rows[0]?.is_available === true,
    `HTTP ${available.response.status}`
  );

  const deactivateItem = await request(`/admin/menu-items/${menuItem.id}/deactivate`, {
    method: 'PATCH',
    headers: bearer(adminToken),
  });
  const deactivatedItemDb = await query(
    'SELECT is_active, image_url FROM menu_items WHERE id = $1',
    [menuItem.id]
  );
  const deactivatedImageStillExists = await fileExists(
    imagePathFromUrl(deactivatedItemDb.rows[0]?.image_url)
  );
  record(
    'admin deactivates item softly and keeps image record available',
    deactivateItem.response.status === 200 &&
      deactivatedItemDb.rows[0]?.is_active === false &&
      deactivatedImageStillExists,
    `HTTP ${deactivateItem.response.status}`
  );

  const kitchenCategories = await request('/admin/categories', {
    headers: bearer(kitchenToken),
  });
  const kitchenMenuItems = await request('/admin/menu-items', {
    headers: bearer(kitchenToken),
  });
  const waiterCategories = await request('/admin/categories', {
    headers: bearer(waiterToken),
  });
  const waiterMenuItems = await request('/admin/menu-items', {
    headers: bearer(waiterToken),
  });
  record(
    'kitchen users cannot access admin management APIs',
    kitchenCategories.response.status === 403 && kitchenMenuItems.response.status === 403,
    `categories=${kitchenCategories.response.status}, menuItems=${kitchenMenuItems.response.status}`
  );
  record(
    'waiter users cannot access admin management APIs',
    waiterCategories.response.status === 403 && waiterMenuItems.response.status === 403,
    `categories=${waiterCategories.response.status}, menuItems=${waiterMenuItems.response.status}`
  );
}

runFr11IntegrationTests()
  .catch((error) => {
    record('FR-11 integration smoke test runner', false, error.message);
  })
  .finally(async () => {
    console.table(results);
    const failed = results.filter((result) => result.status === 'FAIL');
    await closePool();

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  });
