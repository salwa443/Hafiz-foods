import assert from 'node:assert/strict';
import app from '../app.js';
import { closePool, query } from '../config/db.js';
import {
  generateTrackingToken,
  hashTrackingToken,
} from '../utils/trackingToken.js';

const suffix = String(Date.now());
const tableNumber = `F8A${suffix.slice(-10)}`;
const qrToken = `f8a_qr_${suffix}`;
const orderCodes = [
  `F8A-${suffix}-VALID`,
  `F8A-${suffix}-OTHER`,
  `F8A-${suffix}-LEGACY`,
];
const validToken = generateTrackingToken();
const otherToken = generateTrackingToken();
const expectedNotFound = {
  success: false,
  code: 'ORDER_NOT_FOUND',
  message: 'Order tracking information was not found.',
};
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

async function cleanup() {
  await query('DELETE FROM orders WHERE order_code = ANY($1::TEXT[])', [orderCodes]);
  await query('DELETE FROM restaurant_tables WHERE table_number = $1', [tableNumber]);
}

async function getTracking(baseUrl, orderId, token, options = {}) {
  const headers = {};

  if (token !== undefined) {
    headers['X-Order-Tracking-Token'] = token;
  }

  return fetch(
    `${baseUrl}/api/public/orders/${encodeURIComponent(orderId)}/tracking`,
    { headers, ...options }
  );
}

function checkGenericNotFound(response, body, label) {
  check(response.status === 404, `${label} must return 404.`);
  check(JSON.stringify(body) === JSON.stringify(expectedNotFound), `${label} must use the generic response.`);
  check(!JSON.stringify(body).includes('tracking_token'), `${label} must not expose a tracking hash.`);
  check(!JSON.stringify(body).includes(validToken), `${label} must not expose tracking credentials.`);
}

const server = app.listen(0, '127.0.0.1');

try {
  if (!server.listening) {
    await new Promise((resolve) => server.once('listening', resolve));
  }

  await cleanup();
  const table = await query(
    `INSERT INTO restaurant_tables (table_number, qr_token, status, is_active)
     VALUES ($1, $2, 'available', TRUE)
     RETURNING id`,
    [tableNumber, qrToken]
  );
  const orders = await query(
    `INSERT INTO orders
       (order_code, table_id, status, payment_method, total_amount, tracking_token_hash)
     VALUES
       ($1, $2, 'accepted', 'cash', 18.50, $3),
       ($4, $2, 'new', 'pay_at_counter', 7.00, $5),
       ($6, $2, 'completed', 'pay_at_table', 3.00, NULL)
     RETURNING id, order_code`,
    [
      orderCodes[0], table.rows[0].id, hashTrackingToken(validToken),
      orderCodes[1], hashTrackingToken(otherToken),
      orderCodes[2],
    ]
  );
  const orderByCode = new Map(orders.rows.map((order) => [order.order_code, order.id]));
  await query(
    `INSERT INTO order_items
       (order_id, item_name_snapshot, unit_price_snapshot, quantity,
        special_instructions, subtotal)
     VALUES ($1, 'Tracked Pizza', 9.25, 2, 'Extra crisp', 18.50)`,
    [orderByCode.get(orderCodes[0])]
  );

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const validResponse = await getTracking(baseUrl, orderCodes[0], validToken);
  const validBody = await validResponse.json();
  const trackedOrder = validBody.data?.order;
  check(validResponse.status === 200, 'Valid tracking credentials must succeed.');
  check(validBody.success === true, 'Successful tracking must use the standard success structure.');
  check(trackedOrder.orderId === orderCodes[0], 'The correct public Order ID must be returned.');
  check(trackedOrder.tableNumber === tableNumber, 'The correct table number must be returned.');
  check(trackedOrder.status === 'accepted', 'The current status must be returned.');
  check(trackedOrder.totalAmount === '18.50', 'The trusted total must be returned.');
  check(trackedOrder.items[0].name === 'Tracked Pizza', 'Historical item snapshots must be returned.');
  check(trackedOrder.items[0].quantity === 2, 'Stored quantities must be returned.');
  check(trackedOrder.items[0].specialInstructions === 'Extra crisp', 'Instructions must be returned.');

  const serializedSuccess = JSON.stringify(validBody);
  check(!serializedSuccess.includes(validToken), 'Successful responses must not return the raw token.');
  check(!serializedSuccess.includes(hashTrackingToken(validToken)), 'Successful responses must not return the hash.');
  check(!serializedSuccess.includes(qrToken), 'Successful responses must not return QR tokens.');
  check(!('id' in trackedOrder), 'Successful responses must not expose internal order IDs.');
  check(!('tableId' in trackedOrder), 'Successful responses must not expose internal table IDs.');

  const failureCases = [
    ['missing token', orderCodes[0], undefined],
    ['incorrect token', orderCodes[0], generateTrackingToken()],
    ['malformed token', orderCodes[0], 'malformed'],
    ['unknown order', `F8A-${suffix}-UNKNOWN`, validToken],
    ['another order token', orderCodes[1], validToken],
    ['legacy order', orderCodes[2], validToken],
  ];

  for (const [label, orderId, token] of failureCases) {
    const response = await getTracking(baseUrl, orderId, token);
    const body = await response.json();
    checkGenericNotFound(response, body, label);
  }

  console.log(`FR-08 public order tracking API tests passed (${assertions}/${assertions}).`);
} finally {
  await cleanup();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  const remaining = await query(
    'SELECT COUNT(*)::INTEGER AS count FROM orders WHERE order_code = ANY($1::TEXT[])',
    [orderCodes]
  );
  console.log(`FR-08 public order tracking API cleanup verified (${remaining.rows[0].count} orders).`);
  await closePool();
}
