import http from 'node:http';
import assert from 'node:assert/strict';
import app from '../app.js';
import { closePool, query } from '../config/db.js';
import { updateOrderStatus } from '../services/orderStatusService.js';
import {
  generateTrackingToken,
  hashTrackingToken,
} from '../utils/trackingToken.js';

const suffix = Date.now();
const tableNumbers = {
  active: `F7C${String(suffix).slice(-9)}A`,
  other: `F7C${String(suffix).slice(-9)}B`,
  inactive: `F7C${String(suffix).slice(-9)}I`,
};
const tokens = {
  active: `fr07_cancel_active_${suffix}`,
  other: `fr07_cancel_other_${suffix}`,
  inactive: `fr07_cancel_inactive_${suffix}`,
  old: `fr07_cancel_old_${suffix}`,
  regenerated: `fr07_cancel_regenerated_${suffix}`,
};
const orderPrefix = `F7C-${suffix}`;
const tableIds = {};
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

async function cleanup() {
  await query('DELETE FROM orders WHERE order_code LIKE $1', [`${orderPrefix}%`]);
  await query('DELETE FROM restaurant_tables WHERE table_number = ANY($1::TEXT[])', [
    Object.values(tableNumbers),
  ]);
}

async function createOrder(label, status = 'new', tableId = tableIds.active) {
  const orderCode = `${orderPrefix}-${label}`;
  const result = await query(
    `INSERT INTO orders
      (order_code, table_id, status, payment_method, total_amount)
     VALUES ($1, $2, $3, 'cash', 12.00)
     RETURNING id`,
    [orderCode, tableId, status]
  );
  await query(
    `INSERT INTO order_items
      (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot,
       quantity, special_instructions, subtotal)
     VALUES ($1, NULL, $2, 6.00, 2, 'Customer cancellation test', 12.00)`,
    [result.rows[0].id, `Cancel Snapshot ${label}`]
  );
  return orderCode;
}

async function createTrackedOrder(label, status = 'new', tableId = tableIds.active) {
  const orderId = await createOrder(label, status, tableId);
  const trackingToken = generateTrackingToken();
  await query(
    'UPDATE orders SET tracking_token_hash = $1 WHERE order_code = $2',
    [hashTrackingToken(trackingToken), orderId]
  );
  return { orderId, trackingToken };
}

async function cancel(baseUrl, tableNumber, orderId, token, body, trackingToken) {
  const tokenQuery = token === undefined ? '' : `?token=${encodeURIComponent(token)}`;
  const options = { method: 'PATCH', headers: {} };

  if (trackingToken !== undefined) {
    options.headers['X-Order-Tracking-Token'] = trackingToken;
  }

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  return fetch(
    `${baseUrl}/api/public/tables/${encodeURIComponent(tableNumber)}/orders/${encodeURIComponent(orderId)}/cancel${tokenQuery}`,
    options
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
    for (const [key, tableNumber] of Object.entries(tableNumbers)) {
      const table = await query(
        `INSERT INTO restaurant_tables (table_number, status, is_active, qr_token)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          tableNumber,
          key === 'inactive' ? 'inactive' : 'available',
          key !== 'inactive',
          tokens[key],
        ]
      );
      tableIds[key] = table.rows[0].id;
    }

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const trackedOrder = await createTrackedOrder('TRACKED-SUCCESS');
    const trackedSuccessResponse = await cancel(
      baseUrl,
      tableNumbers.active,
      trackedOrder.orderId,
      undefined,
      undefined,
      trackedOrder.trackingToken
    );
    const trackedSuccessBody = await trackedSuccessResponse.json();
    check(trackedSuccessResponse.status === 200, 'Valid tracking-token cancellation should return 200.');
    check(trackedSuccessBody.data.order.status === 'cancelled', 'Tracked order should become cancelled.');
    check(!JSON.stringify(trackedSuccessBody).includes(trackedOrder.trackingToken), 'Response must not expose tracking token.');
    check(!JSON.stringify(trackedSuccessBody).includes('tracking_token_hash'), 'Response must not expose tracking hash.');

    const trackedMissing = await createTrackedOrder('TRACKED-MISSING');
    const trackedMissingResponse = await cancel(
      baseUrl, tableNumbers.active, trackedMissing.orderId, undefined
    );
    check(trackedMissingResponse.status === 404, 'Missing tracking token should not authorize a tracked order.');
    check((await storedStatus(trackedMissing.orderId)) === 'new', 'Missing tracking token must not update order.');

    const trackedInvalid = await createTrackedOrder('TRACKED-INVALID');
    const trackedInvalidResponse = await cancel(
      baseUrl,
      tableNumbers.active,
      trackedInvalid.orderId,
      undefined,
      undefined,
      generateTrackingToken()
    );
    check(trackedInvalidResponse.status === 404, 'Incorrect tracking token should return 404.');
    check((await storedStatus(trackedInvalid.orderId)) === 'new', 'Incorrect tracking token must not update order.');

    const trackedOther = await createTrackedOrder('TRACKED-OTHER');
    const crossOrderTokenResponse = await cancel(
      baseUrl,
      tableNumbers.active,
      trackedInvalid.orderId,
      undefined,
      undefined,
      trackedOther.trackingToken
    );
    check(crossOrderTokenResponse.status === 404, 'Another order tracking token should return 404.');
    check((await storedStatus(trackedInvalid.orderId)) === 'new', 'Cross-order token must not update order.');

    const trackedQrFallback = await createTrackedOrder('TRACKED-QR-FALLBACK');
    const trackedQrFallbackResponse = await cancel(
      baseUrl,
      tableNumbers.active,
      trackedQrFallback.orderId,
      tokens.active
    );
    check(trackedQrFallbackResponse.status === 404, 'Tracked orders must reject QR-only fallback.');
    check((await storedStatus(trackedQrFallback.orderId)) === 'new', 'QR fallback must not update tracked order.');

    const successfulOrder = await createOrder('SUCCESS');
    const successResponse = await cancel(
      baseUrl,
      tableNumbers.active,
      successfulOrder,
      tokens.active
    );
    const successBody = await successResponse.json();
    check(successResponse.status === 200, 'Valid QR cancellation should return 200 without JWT.');
    check(successBody.success === true, 'Valid cancellation should succeed.');
    check(successBody.data.order.status === 'cancelled', 'Response status should be cancelled.');
    check(successBody.data.order.orderId === successfulOrder, 'Response should contain public Order ID.');
    check(successBody.data.order.tableNumber === tableNumbers.active, 'Response should contain table number.');
    check(!('id' in successBody.data.order), 'Response must not expose internal order ID.');
    check(!JSON.stringify(successBody).includes(tokens.active), 'Response must not expose QR token.');
    check((await storedStatus(successfulOrder)) === 'cancelled', 'Database status should be cancelled.');

    const missingTokenOrder = await createOrder('MISSING-TOKEN');
    const missingTokenResponse = await cancel(
      baseUrl,
      tableNumbers.active,
      missingTokenOrder,
      undefined
    );
    check(missingTokenResponse.status === 404, 'Missing QR token should return 404.');
    check((await storedStatus(missingTokenOrder)) === 'new', 'Missing token must not update order.');

    const invalidTokenOrder = await createOrder('INVALID-TOKEN');
    const invalidTokenResponse = await cancel(
      baseUrl,
      tableNumbers.active,
      invalidTokenOrder,
      'valid_format_wrong_token'
    );
    check(invalidTokenResponse.status === 404, 'Invalid QR token should return 404.');
    check((await storedStatus(invalidTokenOrder)) === 'new', 'Invalid token must not update order.');

    const oldTokenOrder = await createOrder('OLD-TOKEN');
    await query(
      'UPDATE restaurant_tables SET qr_token = $1 WHERE id = $2',
      [tokens.old, tableIds.active]
    );
    await query(
      'UPDATE restaurant_tables SET qr_token = $1 WHERE id = $2',
      [tokens.regenerated, tableIds.active]
    );
    const oldTokenResponse = await cancel(
      baseUrl,
      tableNumbers.active,
      oldTokenOrder,
      tokens.old
    );
    check(oldTokenResponse.status === 404, 'Regenerated old QR token should return 404.');
    check((await storedStatus(oldTokenOrder)) === 'new', 'Old token must not update order.');

    const inactiveOrder = await createOrder('INACTIVE', 'new', tableIds.inactive);
    const inactiveResponse = await cancel(
      baseUrl,
      tableNumbers.inactive,
      inactiveOrder,
      tokens.inactive
    );
    check(inactiveResponse.status === 404, 'Inactive table QR should return 404.');
    check((await storedStatus(inactiveOrder)) === 'new', 'Inactive table must not update order.');

    const unknownResponse = await cancel(
      baseUrl,
      tableNumbers.active,
      `${orderPrefix}-MISSING`,
      tokens.regenerated
    );
    check(unknownResponse.status === 404, 'Unknown order should return 404.');

    const otherOrder = await createOrder('OTHER-TABLE', 'new', tableIds.other);
    const crossTableResponse = await cancel(
      baseUrl,
      tableNumbers.active,
      otherOrder,
      tokens.regenerated
    );
    const crossTableBody = await crossTableResponse.json();
    check(crossTableResponse.status === 404, 'Cross-table order should return 404.');
    check(crossTableBody.message === 'Order was not found.', 'Cross-table response should not reveal association.');
    check((await storedStatus(otherOrder)) === 'new', 'Cross-table request must not update order.');

    for (const status of ['accepted', 'preparing', 'ready', 'completed']) {
      const orderId = await createOrder(`STATUS-${status.toUpperCase()}`, status);
      const response = await cancel(
        baseUrl,
        tableNumbers.active,
        orderId,
        tokens.regenerated
      );
      check(response.status === 409, `${status} order cancellation should return 409.`);
      check((await storedStatus(orderId)) === status, `${status} order must remain unchanged.`);
    }

    const duplicateResponse = await cancel(
      baseUrl,
      tableNumbers.active,
      successfulOrder,
      tokens.regenerated
    );
    check(duplicateResponse.status === 409, 'Duplicate cancellation should return 409.');

    const injectedOrder = await createOrder('INJECTED-FIELDS');
    const injectedResponse = await cancel(
      baseUrl,
      tableNumbers.active,
      injectedOrder,
      tokens.regenerated,
      { actor: 'kitchen', currentStatus: 'new' }
    );
    check(injectedResponse.status === 400, 'Client actor/current status fields should be rejected.');
    check((await storedStatus(injectedOrder)) === 'new', 'Injected fields must not update order.');

    const raceOrder = await createOrder('RACE');
    const raceResults = await Promise.all([
      cancel(baseUrl, tableNumbers.active, raceOrder, tokens.regenerated),
      updateOrderStatus({
        orderId: raceOrder,
        targetStatus: 'accepted',
        actor: 'kitchen',
      }).then(
        () => ({ status: 200 }),
        (error) => ({ status: error.statusCode })
      ),
    ]);
    const raceStatuses = [raceResults[0].status, raceResults[1].status];
    check(raceStatuses.filter((status) => status === 200).length === 1, 'Race should have one winner.');
    check(raceStatuses.includes(409), 'Race loser should receive a conflict.');
    check(
      ['accepted', 'cancelled'].includes(await storedStatus(raceOrder)),
      'Race should leave one valid committed status.'
    );

    console.log(`FR-07 customer cancellation tests passed (${assertions}/${assertions}).`);
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
      'SELECT COUNT(*)::INTEGER AS count FROM restaurant_tables WHERE table_number = ANY($1::TEXT[])',
      [Object.values(tableNumbers)]
    );
    assert.equal(remainingOrders.rows[0].count, 0);
    assert.equal(remainingTables.rows[0].count, 0);
    console.log('FR-07 customer cancellation cleanup verified (0 orders, 0 tables).');
    await closePool();
  }
}

run().catch((error) => {
  console.error('FR-07 customer cancellation tests failed:', error);
  process.exitCode = 1;
});
