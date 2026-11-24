import { closePool, query } from '../config/db.js';
import { env } from '../config/env.js';

const apiBaseUrl = `http://localhost:${env.port}/api`;
const frontendBaseUrl = env.frontendUrl.replace(/\/+$/, '');
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
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    body = await response.json();
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

function readPngSize(buffer) {
  const signature = Array.from(buffer.subarray(0, 8)).join(',');

  if (signature !== '137,80,78,71,13,10,26,10') {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function runFr01IntegrationTests() {
  const adminToken = await login('auth.admin@example.com');
  const kitchenToken = await login('auth.kitchen@example.com');
  const waiterToken = await login('auth.waiter@example.com');

  record('admin logs in', Boolean(adminToken));

  const seededTables = await query(
    `
      SELECT id, table_number, qr_token, qr_code_data, status, is_active
      FROM restaurant_tables
      WHERE table_number IN ('T01', 'T02')
      ORDER BY table_number
    `
  );
  const t01 = seededTables.rows.find((table) => table.table_number === 'T01');
  const t02 = seededTables.rows.find((table) => table.table_number === 'T02');
  record(
    'seeded T01 and T02 are present as existing assignment tables',
    Boolean(t01?.id && t02?.id),
    `rows=${seededTables.rowCount}`
  );

  const t01Qr = t01
    ? await request(`/admin/tables/${t01.id}/qr`, { headers: bearer(adminToken) })
    : null;
  const t02Qr = t02
    ? await request(`/admin/tables/${t02.id}/qr`, { headers: bearer(adminToken) })
    : null;
  const t01Url = t01Qr?.body?.data?.qr?.qrUrl;
  const t02Url = t02Qr?.body?.data?.qr?.qrUrl;
  record(
    'T01 and T02 QR URLs are unique and table-specific',
    t01Qr?.response.status === 200 &&
      t02Qr?.response.status === 200 &&
      t01Url?.startsWith(`${frontendBaseUrl}/menu/T01/`) &&
      t02Url?.startsWith(`${frontendBaseUrl}/menu/T02/`) &&
      t01Url !== t02Url,
    `T01=${t01Url}, T02=${t02Url}`
  );

  const duplicateT01 = await request('/admin/tables', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({ tableNumber: 'T01' }),
  });
  record(
    'creating duplicate T01 is rejected because seeded T01 already exists',
    duplicateT01.response.status === 409,
    `HTTP ${duplicateT01.response.status}`
  );

  const suffix = Date.now().toString().slice(-6);
  const firstTableNumber = `F101${suffix}`;
  const secondTableNumber = `F102${suffix}`;
  const createFirst = await request('/admin/tables', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({ tableNumber: firstTableNumber }),
  });
  const firstTable = createFirst.body?.data?.table;
  const createSecond = await request('/admin/tables', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({ tableNumber: secondTableNumber }),
  });
  const secondTable = createSecond.body?.data?.table;
  record(
    'admin creates two active test tables',
    createFirst.response.status === 201 &&
      createSecond.response.status === 201 &&
      firstTable?.is_active === true &&
      secondTable?.is_active === true,
    `first=${createFirst.response.status}, second=${createSecond.response.status}`
  );

  const updatedFirstNumber = `${firstTableNumber}E`;
  const editFirst = await request(`/admin/tables/${firstTable.id}`, {
    method: 'PUT',
    headers: bearer(adminToken),
    body: JSON.stringify({
      tableNumber: updatedFirstNumber,
      status: 'available',
    }),
  });
  record(
    'admin edits a table',
    editFirst.response.status === 200 &&
      editFirst.body?.data?.table?.table_number === updatedFirstNumber,
    `HTTP ${editFirst.response.status}`
  );

  const statusUpdate = await request(`/admin/tables/${firstTable.id}/status`, {
    method: 'PATCH',
    headers: bearer(adminToken),
    body: JSON.stringify({ status: 'occupied' }),
  });
  record(
    'order-free table cannot be marked occupied manually',
    statusUpdate.response.status === 409,
    `HTTP ${statusUpdate.response.status}`
  );

  const firstQr = await request(`/admin/tables/${firstTable.id}/qr/generate`, {
    method: 'POST',
    headers: bearer(adminToken),
  });
  const secondQr = await request(`/admin/tables/${secondTable.id}/qr/generate`, {
    method: 'POST',
    headers: bearer(adminToken),
  });
  const firstQrData = firstQr.body?.data?.qr;
  const secondQrData = secondQr.body?.data?.qr;
  record(
    'admin generates and previews QR codes for both test tables',
    firstQr.response.status === 200 &&
      secondQr.response.status === 200 &&
      firstQrData?.qrImageDataUrl?.startsWith('data:image/png;base64,') &&
      secondQrData?.qrImageDataUrl?.startsWith('data:image/png;base64,') &&
      firstQrData.qrUrl !== secondQrData.qrUrl,
    `first=${firstQr.response.status}, second=${secondQr.response.status}`
  );

  const firstDownload = await fetch(`${apiBaseUrl}/admin/tables/${firstTable.id}/qr/download`, {
    headers: bearer(adminToken),
  });
  const secondDownload = await fetch(`${apiBaseUrl}/admin/tables/${secondTable.id}/qr/download`, {
    headers: bearer(adminToken),
  });
  const firstPngSize = readPngSize(Buffer.from(await firstDownload.arrayBuffer()));
  const secondPngSize = readPngSize(Buffer.from(await secondDownload.arrayBuffer()));
  record(
    'admin downloads printable QR PNGs',
    firstDownload.status === 200 &&
      secondDownload.status === 200 &&
      firstPngSize?.width === 1024 &&
      secondPngSize?.width === 1024,
    `first=${firstPngSize?.width}x${firstPngSize?.height}, second=${secondPngSize?.width}x${secondPngSize?.height}`
  );

  const oldToken = firstQrData.qrToken;
  const regenerateFirst = await request(`/admin/tables/${firstTable.id}/qr/regenerate`, {
    method: 'PATCH',
    headers: bearer(adminToken),
  });
  const regeneratedQr = regenerateFirst.body?.data?.qr;
  record(
    'admin regenerates QR and receives a new URL',
    regenerateFirst.response.status === 200 &&
      regeneratedQr?.qrToken !== oldToken &&
      regeneratedQr?.qrUrl !== firstQrData.qrUrl,
    `HTTP ${regenerateFirst.response.status}`
  );

  const oldValidation = await request(
    `/admin/tables/qr/validate?tableNumber=${encodeURIComponent(updatedFirstNumber)}&token=${encodeURIComponent(oldToken)}`,
    { headers: bearer(adminToken) }
  );
  const newValidation = await request(
    `/admin/tables/qr/validate?tableNumber=${encodeURIComponent(updatedFirstNumber)}&token=${encodeURIComponent(regeneratedQr.qrToken)}`,
    { headers: bearer(adminToken) }
  );
  record(
    'previous QR token is invalidated and new token validates',
    oldValidation.response.status === 200 &&
      newValidation.response.status === 200 &&
      oldValidation.body?.data?.valid === false &&
      newValidation.body?.data?.valid === true,
    `old=${oldValidation.body?.data?.valid}, new=${newValidation.body?.data?.valid}`
  );

  const deactivateSecond = await request(`/admin/tables/${secondTable.id}/deactivate`, {
    method: 'PATCH',
    headers: bearer(adminToken),
  });
  const inactiveQr = await request(`/admin/tables/${secondTable.id}/qr/generate`, {
    method: 'POST',
    headers: bearer(adminToken),
  });
  const activeList = await request('/admin/tables?includeInactive=false', {
    headers: bearer(adminToken),
  });
  record(
    'inactive table cannot be used as an active table',
    deactivateSecond.response.status === 200 &&
      deactivateSecond.body?.data?.table?.is_active === false &&
      inactiveQr.response.status === 400 &&
      !activeList.body?.data?.tables?.some((table) => table.id === secondTable.id),
    `deactivate=${deactivateSecond.response.status}, qr=${inactiveQr.response.status}`
  );

  const missingAuth = await request('/admin/tables');
  const kitchenAccess = await request('/admin/tables', { headers: bearer(kitchenToken) });
  const waiterAccess = await request('/admin/tables', { headers: bearer(waiterToken) });
  record(
    'admin table APIs reject unauthenticated, kitchen and waiter access',
    missingAuth.response.status === 401 &&
      kitchenAccess.response.status === 403 &&
      waiterAccess.response.status === 403,
    `none=${missingAuth.response.status}, kitchen=${kitchenAccess.response.status}, waiter=${waiterAccess.response.status}`
  );

  const invalidId = await request('/admin/tables/not-a-number', {
    headers: bearer(adminToken),
  });
  record('invalid table IDs are handled safely', invalidId.response.status === 400, `HTTP ${invalidId.response.status}`);
}

runFr01IntegrationTests()
  .catch((error) => {
    record('FR-01 integration smoke test runner', false, error.message);
  })
  .finally(async () => {
    console.table(results);
    const failed = results.filter((result) => result.status === 'FAIL');
    await closePool();

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  });
