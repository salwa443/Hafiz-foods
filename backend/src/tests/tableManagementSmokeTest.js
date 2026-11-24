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

async function runTableManagementTests() {
  const adminToken = await login('auth.admin@example.com');
  const kitchenToken = await login('auth.kitchen@example.com');
  const waiterToken = await login('auth.waiter@example.com');
  const tableNumber = `API${Date.now().toString().slice(-8)}`;

  const createTable = await request('/admin/tables', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      tableNumber,
    }),
  });
  const table = createTable.body?.data?.table;
  record(
    'admin creates table',
    createTable.response.status === 201 &&
      table?.table_number === tableNumber &&
      table?.status === 'available' &&
      table?.is_active === true &&
      table?.qr_token &&
      table?.qr_code_data === `/menu/${tableNumber}/${table.qr_token}`,
    `HTTP ${createTable.response.status}`
  );

  const listTables = await request('/admin/tables', {
    headers: bearer(adminToken),
  });
  record(
    'admin retrieves all tables',
    listTables.response.status === 200 &&
      listTables.body?.data?.tables?.some((item) => item.id === table.id),
    `HTTP ${listTables.response.status}`
  );

  const getTable = await request(`/admin/tables/${table.id}`, {
    headers: bearer(adminToken),
  });
  record(
    'admin retrieves one table',
    getTable.response.status === 200 && getTable.body?.data?.table?.id === table.id,
    `HTTP ${getTable.response.status}`
  );

  const updatedTableNumber = `${tableNumber}E`;
  const editTable = await request(`/admin/tables/${table.id}`, {
    method: 'PUT',
    headers: bearer(adminToken),
    body: JSON.stringify({
      tableNumber: updatedTableNumber,
      status: 'available',
    }),
  });
  record(
    'admin edits table',
    editTable.response.status === 200 &&
      editTable.body?.data?.table?.table_number === updatedTableNumber &&
      editTable.body?.data?.table?.qr_code_data === `/menu/${updatedTableNumber}/${table.qr_token}`,
    `HTTP ${editTable.response.status}`
  );

  const updateStatus = await request(`/admin/tables/${table.id}/status`, {
    method: 'PATCH',
    headers: bearer(adminToken),
    body: JSON.stringify({
      status: 'occupied',
    }),
  });
  record(
    'order-free table cannot be marked occupied',
    updateStatus.response.status === 409,
    `HTTP ${updateStatus.response.status}`
  );

  const duplicateTable = await request('/admin/tables', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      tableNumber: updatedTableNumber,
    }),
  });
  record(
    'duplicate table number is rejected',
    duplicateTable.response.status === 409,
    `HTTP ${duplicateTable.response.status}`
  );

  const invalidStatus = await request(`/admin/tables/${table.id}/status`, {
    method: 'PATCH',
    headers: bearer(adminToken),
    body: JSON.stringify({
      status: 'reserved',
    }),
  });
  record('invalid table status is rejected', invalidStatus.response.status === 400, `HTTP ${invalidStatus.response.status}`);

  const invalidId = await request('/admin/tables/not-a-number', {
    headers: bearer(adminToken),
  });
  record('invalid table id is rejected', invalidId.response.status === 400, `HTTP ${invalidId.response.status}`);

  const missingTable = await request('/admin/tables/999999999', {
    headers: bearer(adminToken),
  });
  record('missing table returns 404', missingTable.response.status === 404, `HTTP ${missingTable.response.status}`);

  const deactivateTable = await request(`/admin/tables/${table.id}/deactivate`, {
    method: 'PATCH',
    headers: bearer(adminToken),
  });
  record(
    'admin deactivates table softly',
    deactivateTable.response.status === 200 &&
      deactivateTable.body?.data?.table?.status === 'inactive' &&
      deactivateTable.body?.data?.table?.is_active === false,
    `HTTP ${deactivateTable.response.status}`
  );

  const activeList = await request('/admin/tables?includeInactive=false', {
    headers: bearer(adminToken),
  });
  record(
    'inactive tables excluded from active table list',
    activeList.response.status === 200 &&
      !activeList.body?.data?.tables?.some((item) => item.id === table.id),
    `HTTP ${activeList.response.status}`
  );

  const reactivateInactive = await request(`/admin/tables/${table.id}/status`, {
    method: 'PATCH',
    headers: bearer(adminToken),
    body: JSON.stringify({
      status: 'available',
    }),
  });
  record(
    'inactive table is not treated as active by status endpoint',
    reactivateInactive.response.status === 400,
    `HTTP ${reactivateInactive.response.status}`
  );

  const reactivateTable = await request(`/admin/tables/${table.id}/reactivate`, {
    method: 'PATCH',
    headers: bearer(adminToken),
  });
  record(
    'admin explicitly reactivates an archived table',
    reactivateTable.response.status === 200 &&
      reactivateTable.body?.data?.table?.id === table.id &&
      reactivateTable.body?.data?.table?.status === 'available' &&
      reactivateTable.body?.data?.table?.is_active === true,
    `HTTP ${reactivateTable.response.status}`
  );
  record(
    'reactivation preserves QR token and URL',
    reactivateTable.body?.data?.table?.qr_token === table.qr_token &&
      reactivateTable.body?.data?.table?.qr_code_data ===
        `/menu/${updatedTableNumber}/${table.qr_token}`
  );

  const kitchenReactivate = await request(`/admin/tables/${table.id}/reactivate`, {
    method: 'PATCH',
    headers: bearer(kitchenToken),
  });
  const waiterReactivate = await request(`/admin/tables/${table.id}/reactivate`, {
    method: 'PATCH',
    headers: bearer(waiterToken),
  });
  record(
    'reactivation remains admin-only',
    kitchenReactivate.response.status === 403 && waiterReactivate.response.status === 403
  );

  const missingToken = await request('/admin/tables');
  record('requests without authentication are rejected', missingToken.response.status === 401, `HTTP ${missingToken.response.status}`);

  const kitchenAccess = await request('/admin/tables', {
    headers: bearer(kitchenToken),
  });
  record('kitchen role cannot access admin table APIs', kitchenAccess.response.status === 403, `HTTP ${kitchenAccess.response.status}`);

  const waiterAccess = await request('/admin/tables', {
    headers: bearer(waiterToken),
  });
  record('waiter role cannot access admin table APIs', waiterAccess.response.status === 403, `HTTP ${waiterAccess.response.status}`);
}

runTableManagementTests()
  .catch((error) => {
    record('table management smoke test runner', false, error.message);
  })
  .finally(async () => {
    console.table(results);
    const failed = results.filter((result) => result.status === 'FAIL');
    await closePool();

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  });
