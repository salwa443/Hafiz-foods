import http from 'node:http';
import assert from 'node:assert/strict';
import app from '../app.js';
import { closePool, query } from '../config/db.js';
import { createUpdateKitchenOrderStatusHandler } from '../controllers/kitchenOrderController.js';
import { generateToken } from '../services/authService.js';

const suffix = Date.now();
const tableNumber = `F7A${String(suffix).slice(-10)}`;
const qrToken = `fr07_status_api_${suffix}`;
const orderPrefix = `F7A-${suffix}`;
const emails = {
  kitchen: `fr07.api.kitchen.${suffix}@example.com`,
  admin: `fr07.api.admin.${suffix}@example.com`,
  waiter: `fr07.api.waiter.${suffix}@example.com`,
};
let assertions = 0;
let tableId;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

async function cleanup() {
  await query('DELETE FROM orders WHERE order_code LIKE $1', [`${orderPrefix}%`]);
  await query('DELETE FROM restaurant_tables WHERE table_number = $1', [tableNumber]);
  await query('DELETE FROM users WHERE email = ANY($1::TEXT[])', [Object.values(emails)]);
}

async function createUser(role) {
  const result = await query(
    `INSERT INTO users (role_id, name, email, password_hash, is_active)
     VALUES ((SELECT id FROM roles WHERE name = $1), $2, $3, $4, TRUE)
     RETURNING id, name, email, is_active`,
    [role, `FR07 API ${role}`, emails[role], 'fr07-api-password-placeholder']
  );
  return { ...result.rows[0], role };
}

async function createOrder(label, status = 'new') {
  const orderCode = `${orderPrefix}-${label}`;
  const result = await query(
    `INSERT INTO orders
      (order_code, table_id, status, payment_method, total_amount)
     VALUES ($1, $2, $3, 'cash', 8.00)
     RETURNING id`,
    [orderCode, tableId, status]
  );
  await query(
    `INSERT INTO order_items
      (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot,
       quantity, special_instructions, subtotal)
     VALUES ($1, NULL, $2, 4.00, 2, 'API instruction', 8.00)`,
    [result.rows[0].id, `API Snapshot ${label}`]
  );
  return orderCode;
}

async function patchStatus(baseUrl, orderId, statusBody, token) {
  return fetch(
    `${baseUrl}/api/kitchen/orders/${encodeURIComponent(orderId)}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(statusBody),
    }
  );
}

async function storedStatus(orderId) {
  const result = await query('SELECT status FROM orders WHERE order_code = $1', [orderId]);
  return result.rows[0]?.status;
}

async function run() {
  const server = http.createServer(app);

  try {
    await cleanup();
    const table = await query(
      `INSERT INTO restaurant_tables (table_number, status, is_active, qr_token)
       VALUES ($1, 'available', TRUE, $2)
       RETURNING id`,
      [tableNumber, qrToken]
    );
    tableId = table.rows[0].id;

    const users = {
      kitchen: await createUser('kitchen'),
      admin: await createUser('admin'),
      waiter: await createUser('waiter'),
    };
    const tokens = {
      kitchen: generateToken(users.kitchen),
      admin: generateToken(users.admin),
      waiter: generateToken(users.waiter),
    };

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const flowOrder = await createOrder('FLOW');
    for (const status of ['accepted', 'preparing', 'ready', 'completed']) {
      const response = await patchStatus(baseUrl, flowOrder, { status }, tokens.kitchen);
      const body = await response.json();
      check(response.status === 200, `Kitchen transition to ${status} should return 200.`);
      check(body.success === true, `Kitchen transition to ${status} should succeed.`);
      check(body.data.order.status === status, `Response should contain ${status}.`);
      check(body.data.order.orderId === flowOrder, 'Response should contain public Order ID.');
      check(body.data.order.tableNumber === tableNumber, 'Response should contain table number.');
      check(body.data.order.items[0].name === 'API Snapshot FLOW', 'Response should use item snapshot.');
      check(!('id' in body.data.order), 'Response must not expose internal order ID.');
      check(!('paymentMethod' in body.data.order), 'Response must not expose payment information.');
      check((await storedStatus(flowOrder)) === status, `Database should persist ${status}.`);
    }

    const validationOrder = await createOrder('VALIDATION');
    for (const [label, payload] of [
      ['missing status', {}],
      ['unknown status', { status: 'unknown' }],
      ['non-string status', { status: 1 }],
      ['customer cancellation', { status: 'cancelled' }],
      ['unexpected actor field', { status: 'accepted', actor: 'customer' }],
    ]) {
      const response = await patchStatus(baseUrl, validationOrder, payload, tokens.kitchen);
      check(response.status === 400, `${label} should return 400.`);
      const body = await response.json();
      check(body.message === 'Validation failed.', `${label} should use validation response.`);
      check(!('stack' in body), `${label} must not expose a stack trace.`);
      check((await storedStatus(validationOrder)) === 'new', `${label} must not change database state.`);
    }

    const roleOrder = await createOrder('ROLES');
    for (const [role, token, expectedStatus] of [
      ['unauthenticated', null, 401],
      ['admin', tokens.admin, 403],
      ['waiter', tokens.waiter, 403],
    ]) {
      const response = await patchStatus(baseUrl, roleOrder, { status: 'accepted' }, token);
      check(response.status === expectedStatus, `${role} request should return ${expectedStatus}.`);
      check((await storedStatus(roleOrder)) === 'new', `${role} request must not update the order.`);
    }

    const unknownResponse = await patchStatus(
      baseUrl,
      `${orderPrefix}-MISSING`,
      { status: 'accepted' },
      tokens.kitchen
    );
    const unknownBody = await unknownResponse.json();
    check(unknownResponse.status === 404, 'Unknown Order ID should return 404.');
    check(unknownBody.message === 'Order was not found.', 'Unknown order should use safe message.');
    check(!('stack' in unknownBody), 'Not-found response must not expose a stack trace.');

    const duplicateOrder = await createOrder('DUPLICATE', 'accepted');
    const duplicateResponse = await patchStatus(
      baseUrl,
      duplicateOrder,
      { status: 'accepted' },
      tokens.kitchen
    );
    check(duplicateResponse.status === 409, 'Duplicate transition should return 409.');
    check((await storedStatus(duplicateOrder)) === 'accepted', 'Duplicate transition must not change state.');

    const skippedOrder = await createOrder('SKIPPED');
    const skippedResponse = await patchStatus(
      baseUrl,
      skippedOrder,
      { status: 'preparing' },
      tokens.kitchen
    );
    check(skippedResponse.status === 409, 'Skipped transition should return 409.');
    check((await storedStatus(skippedOrder)) === 'new', 'Skipped transition must not change state.');

    let safeUnexpectedError;
    const failingHandler = createUpdateKitchenOrderStatusHandler(async () => {
      throw new Error('sensitive SQL failure detail');
    });
    await failingHandler(
      { params: { orderId: flowOrder }, body: { status: 'accepted' } },
      {},
      (error) => { safeUnexpectedError = error; }
    );
    check(safeUnexpectedError?.statusCode === 500, 'Unexpected service failure should map to 500.');
    check(
      safeUnexpectedError?.message === 'Unable to update order status.',
      'Unexpected service failure should use a sanitized message.'
    );
    check(
      !safeUnexpectedError.message.includes('SQL'),
      'Unexpected service failure must not expose database details.'
    );

    console.log(`FR-07 kitchen status API tests passed (${assertions}/${assertions}).`);
  } finally {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    await cleanup();
    const remainingOrders = await query(
      'SELECT COUNT(*)::INTEGER AS count FROM orders WHERE order_code LIKE $1',
      [`${orderPrefix}%`]
    );
    const remainingTables = await query(
      'SELECT COUNT(*)::INTEGER AS count FROM restaurant_tables WHERE table_number = $1',
      [tableNumber]
    );
    const remainingUsers = await query(
      'SELECT COUNT(*)::INTEGER AS count FROM users WHERE email = ANY($1::TEXT[])',
      [Object.values(emails)]
    );
    assert.equal(remainingOrders.rows[0].count, 0);
    assert.equal(remainingTables.rows[0].count, 0);
    assert.equal(remainingUsers.rows[0].count, 0);
    console.log('FR-07 kitchen status API cleanup verified (0 orders, 0 tables, 0 users).');
    await closePool();
  }
}

run().catch((error) => {
  console.error('FR-07 kitchen status API tests failed:', error);
  process.exitCode = 1;
});
