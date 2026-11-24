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

function publicAccessPath(tableNumber, token) {
  return `/public/tables/${encodeURIComponent(tableNumber)}/access?token=${encodeURIComponent(token)}`;
}

async function runPublicTableAccessTests() {
  let adminToken;
  let table;
  let latestToken;

  try {
    adminToken = await login('auth.admin@example.com');
    const tableNumber = `API${Date.now().toString().slice(-8)}`;

    const createTable = await request('/admin/tables', {
      method: 'POST',
      headers: bearer(adminToken),
      body: JSON.stringify({ tableNumber }),
    });
    table = createTable.body?.data?.table;
    latestToken = table?.qr_token;
    record('admin creates active test table', createTable.response.status === 201 && table?.is_active === true, `HTTP ${createTable.response.status}`);

    const validAccess = await request(publicAccessPath(tableNumber, latestToken));
    record(
      'valid active table and current QR token succeed without JWT',
      validAccess.response.status === 200 &&
        validAccess.body?.data?.table?.id === table.id &&
        validAccess.body?.data?.table?.tableNumber === tableNumber &&
        !validAccess.body?.data?.table?.qrToken &&
        !validAccess.body?.data?.table?.qr_code_data,
      `HTTP ${validAccess.response.status}`
    );

    const incorrectToken = await request(publicAccessPath(tableNumber, 'wrong-token-value'));
    record(
      'incorrect token fails with generic invalid QR response',
      incorrectToken.response.status === 404 &&
        incorrectToken.body?.message === 'Invalid or expired QR code.',
      `HTTP ${incorrectToken.response.status}`
    );

    const unknownTable = await request(publicAccessPath('UNKNOWN-TABLE', latestToken));
    record(
      'unknown table fails with generic invalid QR response',
      unknownTable.response.status === 404 &&
        unknownTable.body?.message === 'Invalid or expired QR code.',
      `HTTP ${unknownTable.response.status}`
    );

    const regenerateQr = await request(`/admin/tables/${table.id}/qr/regenerate`, {
      method: 'PATCH',
      headers: bearer(adminToken),
    });
    const regeneratedQr = regenerateQr.body?.data?.qr;
    const oldToken = latestToken;
    latestToken = regeneratedQr?.qrToken;
    record(
      'admin regenerates QR token for public access test',
      regenerateQr.response.status === 200 && latestToken && latestToken !== oldToken,
      `HTTP ${regenerateQr.response.status}`
    );

    const oldTokenAccess = await request(publicAccessPath(tableNumber, oldToken));
    record(
      'old token after QR regeneration fails',
      oldTokenAccess.response.status === 404 &&
        oldTokenAccess.body?.message === 'Invalid or expired QR code.',
      `HTTP ${oldTokenAccess.response.status}`
    );

    const newTokenAccess = await request(publicAccessPath(tableNumber, latestToken));
    record(
      'new regenerated token succeeds',
      newTokenAccess.response.status === 200 &&
        newTokenAccess.body?.data?.table?.tableNumber === tableNumber,
      `HTTP ${newTokenAccess.response.status}`
    );

    const noAuthAdminRoute = await request('/admin/tables');
    record(
      'existing admin routes still reject unauthorized requests',
      noAuthAdminRoute.response.status === 401,
      `HTTP ${noAuthAdminRoute.response.status}`
    );

    const deactivateTable = await request(`/admin/tables/${table.id}/deactivate`, {
      method: 'PATCH',
      headers: bearer(adminToken),
    });
    record('test table is safely deactivated', deactivateTable.response.status === 200, `HTTP ${deactivateTable.response.status}`);

    const deactivatedAccess = await request(publicAccessPath(tableNumber, latestToken));
    record(
      'deactivated table fails with generic invalid QR response',
      deactivatedAccess.response.status === 404 &&
        deactivatedAccess.body?.message === 'Invalid or expired QR code.',
      `HTTP ${deactivatedAccess.response.status}`
    );

    const malformedAccess = await request('/public/tables/bad%20table/access?token=bad%20token');
    record('malformed public access input is rejected', malformedAccess.response.status === 400, `HTTP ${malformedAccess.response.status}`);

    const missingTokenAccess = await request(`/public/tables/${tableNumber}/access`);
    record('missing QR token is rejected', missingTokenAccess.response.status === 400, `HTTP ${missingTokenAccess.response.status}`);

    const longTableNumberAccess = await request(
      `/public/tables/${'A'.repeat(21)}/access?token=${encodeURIComponent(latestToken)}`
    );
    record('excessively long table number is rejected', longTableNumberAccess.response.status === 400, `HTTP ${longTableNumberAccess.response.status}`);

    const longTokenAccess = await request(
      `/public/tables/${tableNumber}/access?token=${'A'.repeat(121)}`
    );
    record('excessively long QR token is rejected', longTokenAccess.response.status === 400, `HTTP ${longTokenAccess.response.status}`);
  } finally {
    if (adminToken && table?.id) {
      await request(`/admin/tables/${table.id}/deactivate`, {
        method: 'PATCH',
        headers: bearer(adminToken),
      });
    }
  }
}

runPublicTableAccessTests()
  .catch((error) => {
    record('public table access smoke test runner', false, error.message);
  })
  .finally(async () => {
    console.table(results);
    const failed = results.filter((result) => result.status === 'FAIL');
    await closePool();

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  });
