import { closePool } from '../config/db.js';
import { env } from '../config/env.js';

const apiBaseUrl = `http://localhost:${env.port}/api`;
const expectedFrontendUrl = env.frontendUrl.replace(/\/+$/, '');
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
  const pngSignature = '137,80,78,71,13,10,26,10';

  if (signature !== pngSignature) {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function runTableQrTests() {
  const adminToken = await login('auth.admin@example.com');
  const kitchenToken = await login('auth.kitchen@example.com');
  const waiterToken = await login('auth.waiter@example.com');
  const tableNumber = `QR${Date.now().toString().slice(-8)}`;

  const createTable = await request('/admin/tables', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({ tableNumber }),
  });
  const table = createTable.body?.data?.table;
  record('admin creates active table for QR', createTable.response.status === 201 && table?.is_active === true, `HTTP ${createTable.response.status}`);

  const qrInfo = await request(`/admin/tables/${table.id}/qr`, {
    headers: bearer(adminToken),
  });
  const qr = qrInfo.body?.data?.qr;
  const expectedQrPath = `/menu/${tableNumber}/${table.qr_token}`;
  const expectedQrUrl = `${expectedFrontendUrl}${expectedQrPath}`;
  record(
    'QR info contains correct table-specific URL',
    qrInfo.response.status === 200 &&
      qr?.qrPath === expectedQrPath &&
      qr?.qrUrl === expectedQrUrl &&
      qr?.tableNumber === tableNumber,
    `HTTP ${qrInfo.response.status}`
  );

  const generateQr = await request(`/admin/tables/${table.id}/qr/generate`, {
    method: 'POST',
    headers: bearer(adminToken),
  });
  const generatedQr = generateQr.body?.data?.qr;
  record(
    'QR generation returns scannable PNG data URL for intended URL',
    generateQr.response.status === 200 &&
      generatedQr?.qrUrl === expectedQrUrl &&
      generatedQr?.qrImageDataUrl?.startsWith('data:image/png;base64,'),
    `HTTP ${generateQr.response.status}`
  );

  const downloadResponse = await fetch(`${apiBaseUrl}/admin/tables/${table.id}/qr/download`, {
    headers: bearer(adminToken),
  });
  const pngBuffer = Buffer.from(await downloadResponse.arrayBuffer());
  const pngSize = readPngSize(pngBuffer);
  record(
    'QR download returns high-resolution PNG',
    downloadResponse.status === 200 &&
      downloadResponse.headers.get('content-type')?.includes('image/png') &&
      pngSize?.width === 1024 &&
      pngSize?.height === 1024,
    `HTTP ${downloadResponse.status}, ${pngSize?.width}x${pngSize?.height}`
  );

  const oldToken = table.qr_token;
  const regenerateQr = await request(`/admin/tables/${table.id}/qr/regenerate`, {
    method: 'PATCH',
    headers: bearer(adminToken),
  });
  const regeneratedQr = regenerateQr.body?.data?.qr;
  record(
    'QR regeneration replaces token and URL',
    regenerateQr.response.status === 200 &&
      regeneratedQr?.qrToken !== oldToken &&
      regeneratedQr?.qrUrl === `${expectedFrontendUrl}/menu/${tableNumber}/${regeneratedQr.qrToken}` &&
      regeneratedQr?.qrImageDataUrl?.startsWith('data:image/png;base64,'),
    `HTTP ${regenerateQr.response.status}`
  );

  const oldQrValidation = await request(
    `/admin/tables/qr/validate?tableNumber=${encodeURIComponent(tableNumber)}&token=${encodeURIComponent(oldToken)}`,
    { headers: bearer(adminToken) }
  );
  record(
    'old QR token is rejected after regeneration',
    oldQrValidation.response.status === 200 &&
      oldQrValidation.body?.data?.valid === false,
    `HTTP ${oldQrValidation.response.status}`
  );

  const newQrValidation = await request(
    `/admin/tables/qr/validate?tableNumber=${encodeURIComponent(tableNumber)}&token=${encodeURIComponent(regeneratedQr.qrToken)}`,
    { headers: bearer(adminToken) }
  );
  record(
    'new QR token validates active table',
    newQrValidation.response.status === 200 &&
      newQrValidation.body?.data?.valid === true &&
      newQrValidation.body?.data?.table?.tableNumber === tableNumber,
    `HTTP ${newQrValidation.response.status}`
  );

  const inactiveTable = await request(`/admin/tables/${table.id}/deactivate`, {
    method: 'PATCH',
    headers: bearer(adminToken),
  });
  record('test table deactivated for inactive QR checks', inactiveTable.response.status === 200, `HTTP ${inactiveTable.response.status}`);

  const inactiveQr = await request(`/admin/tables/${table.id}/qr/generate`, {
    method: 'POST',
    headers: bearer(adminToken),
  });
  record('inactive table QR generation rejected', inactiveQr.response.status === 400, `HTTP ${inactiveQr.response.status}`);

  const missingQr = await request('/admin/tables/999999999/qr', {
    headers: bearer(adminToken),
  });
  record('missing table QR info returns 404', missingQr.response.status === 404, `HTTP ${missingQr.response.status}`);

  const noAuthQr = await request(`/admin/tables/${table.id}/qr`);
  record('QR endpoint rejects missing authentication', noAuthQr.response.status === 401, `HTTP ${noAuthQr.response.status}`);

  const kitchenQr = await request(`/admin/tables/${table.id}/qr`, {
    headers: bearer(kitchenToken),
  });
  record('kitchen role cannot access QR endpoints', kitchenQr.response.status === 403, `HTTP ${kitchenQr.response.status}`);

  const waiterQr = await request(`/admin/tables/${table.id}/qr`, {
    headers: bearer(waiterToken),
  });
  record('waiter role cannot access QR endpoints', waiterQr.response.status === 403, `HTTP ${waiterQr.response.status}`);
}

runTableQrTests()
  .catch((error) => {
    record('table QR smoke test runner', false, error.message);
  })
  .finally(async () => {
    console.table(results);
    const failed = results.filter((result) => result.status === 'FAIL');
    await closePool();

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  });
