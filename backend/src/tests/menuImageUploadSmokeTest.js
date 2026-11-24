import { closePool } from '../config/db.js';
import { env } from '../config/env.js';

const apiBaseUrl = `http://localhost:${env.port}/api`;
const serverBaseUrl = `http://localhost:${env.port}`;
const results = [];

function record(test, passed, detail = '') {
  results.push({ test, status: passed ? 'PASS' : 'FAIL', detail });
}

async function request(path, options = {}) {
  const headers = options.body instanceof FormData
    ? options.headers || {}
    : {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };

  const response = await fetch(`${apiBaseUrl}${path}`, {
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

function pngFile(name = 'item.png') {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  return new File([bytes], name, { type: 'image/png' });
}

function webpFile(name = 'item.webp') {
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
    0x00,
  ]);
  return new File([bytes], name, { type: 'image/webp' });
}

function invalidSignatureFile() {
  return new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], 'fake.png', {
    type: 'image/png',
  });
}

function oversizedJpegFile() {
  const bytes = new Uint8Array((5 * 1024 * 1024) + 1);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return new File([bytes], 'too-large.jpg', { type: 'image/jpeg' });
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

async function runImageUploadTests() {
  const adminToken = await login('auth.admin@example.com');
  const kitchenToken = await login('auth.kitchen@example.com');
  const waiterToken = await login('auth.waiter@example.com');

  const createCategory = await request('/admin/categories', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      name: `Image Upload Category ${Date.now()}`,
      displayOrder: 50,
    }),
  });
  const category = createCategory.body?.data?.category;
  record('test category created', createCategory.response.status === 201, `HTTP ${createCategory.response.status}`);

  const createItem = await request('/admin/menu-items', {
    method: 'POST',
    headers: bearer(adminToken),
    body: menuItemForm(
      {
        categoryId: category.id,
        name: `Image Upload Item ${Date.now()}`,
        description: 'Created with an uploaded image.',
        price: 450,
        isAvailable: true,
      },
      pngFile()
    ),
  });
  const menuItem = createItem.body?.data?.menuItem;
  const firstImageUrl = menuItem?.image_url;
  record(
    'menu item image upload succeeds',
    createItem.response.status === 201 && firstImageUrl?.startsWith('/uploads/menu/'),
    `HTTP ${createItem.response.status}`
  );

  const firstImageAccess = await fetch(`${serverBaseUrl}${firstImageUrl}`);
  record('uploaded image is served statically', firstImageAccess.status === 200, `HTTP ${firstImageAccess.status}`);

  const updateItem = await request(`/admin/menu-items/${menuItem.id}`, {
    method: 'PUT',
    headers: bearer(adminToken),
    body: menuItemForm(
      {
        categoryId: category.id,
        name: `${menuItem.name} Updated`,
        description: 'Updated with a replacement image.',
        price: 550,
        isAvailable: true,
      },
      webpFile()
    ),
  });
  const updatedItem = updateItem.body?.data?.menuItem;
  const replacementImageUrl = updatedItem?.image_url;
  record(
    'menu item image replacement succeeds',
    updateItem.response.status === 200 &&
      replacementImageUrl?.startsWith('/uploads/menu/') &&
      replacementImageUrl !== firstImageUrl,
    `HTTP ${updateItem.response.status}`
  );

  const oldImageAccess = await fetch(`${serverBaseUrl}${firstImageUrl}`);
  record('replaced image file is cleaned up', oldImageAccess.status === 404, `HTTP ${oldImageAccess.status}`);

  const replacementImageAccess = await fetch(`${serverBaseUrl}${replacementImageUrl}`);
  record('replacement image is served statically', replacementImageAccess.status === 200, `HTTP ${replacementImageAccess.status}`);

  const invalidFormat = await request('/admin/menu-items', {
    method: 'POST',
    headers: bearer(adminToken),
    body: menuItemForm(
      {
        categoryId: category.id,
        name: `Invalid Signature ${Date.now()}`,
        price: 100,
        isAvailable: true,
      },
      invalidSignatureFile()
    ),
  });
  record('invalid image signature rejected', invalidFormat.response.status === 400, `HTTP ${invalidFormat.response.status}`);

  const oversized = await request('/admin/menu-items', {
    method: 'POST',
    headers: bearer(adminToken),
    body: menuItemForm(
      {
        categoryId: category.id,
        name: `Oversized Image ${Date.now()}`,
        price: 100,
        isAvailable: true,
      },
      oversizedJpegFile()
    ),
  });
  record('oversized image rejected', oversized.response.status === 400, `HTTP ${oversized.response.status}`);

  const unauthorized = await request('/admin/menu-items', {
    method: 'POST',
    headers: bearer(kitchenToken),
    body: menuItemForm(
      {
        categoryId: category.id,
        name: `Unauthorized Upload ${Date.now()}`,
        price: 100,
        isAvailable: true,
      },
      pngFile('unauthorized.png')
    ),
  });
  record('kitchen cannot upload menu item images', unauthorized.response.status === 403, `HTTP ${unauthorized.response.status}`);

  const waiterUpload = await request('/admin/menu-items', {
    method: 'POST',
    headers: bearer(waiterToken),
    body: menuItemForm(
      {
        categoryId: category.id,
        name: `Waiter Upload ${Date.now()}`,
        price: 100,
        isAvailable: true,
      },
      pngFile('waiter.png')
    ),
  });
  record('waiter cannot upload menu item images', waiterUpload.response.status === 403, `HTTP ${waiterUpload.response.status}`);
}

runImageUploadTests()
  .catch((error) => {
    record('image upload smoke test runner', false, error.message);
  })
  .finally(async () => {
    console.table(results);
    const failed = results.filter((result) => result.status === 'FAIL');
    await closePool();

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  });
