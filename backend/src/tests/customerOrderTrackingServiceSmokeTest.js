import assert from 'node:assert/strict';
import { closePool, query } from '../config/db.js';
import {
  CUSTOMER_ORDER_TRACKING_ERROR_CODES,
  CustomerOrderTrackingError,
  getCustomerTrackedOrder,
} from '../services/customerOrderTrackingService.js';
import {
  generateTrackingToken,
  hashTrackingToken,
} from '../utils/trackingToken.js';

const suffix = String(Date.now());
const tableNumbers = [
  `F8S${suffix.slice(-10)}A`,
  `F8S${suffix.slice(-10)}B`,
];
const orderCodes = [
  `F8S-${suffix}-A`,
  `F8S-${suffix}-B`,
];
const firstToken = generateTrackingToken();
const secondToken = generateTrackingToken();
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

async function expectNotFound(operation) {
  await assert.rejects(operation, (error) => {
    check(error instanceof CustomerOrderTrackingError, 'A generic tracking error is required.');
    check(error.statusCode === 404, 'Tracking authorization failures must use 404.');
    check(
      error.code === CUSTOMER_ORDER_TRACKING_ERROR_CODES.ORDER_NOT_FOUND,
      'Tracking authorization failures must share one stable code.'
    );
    check(
      error.message === 'Order tracking information was not found.',
      'Tracking authorization failures must share one safe message.'
    );
    return true;
  });
}

async function cleanup() {
  await query('DELETE FROM orders WHERE order_code = ANY($1::TEXT[])', [orderCodes]);
  await query('DELETE FROM restaurant_tables WHERE table_number = ANY($1::TEXT[])', [
    tableNumbers,
  ]);
}

try {
  await cleanup();

  const tables = await query(
    `INSERT INTO restaurant_tables (table_number, qr_token, status, is_active)
     VALUES ($1, $2, 'available', TRUE), ($3, $4, 'available', TRUE)
     RETURNING id, table_number`,
    [tableNumbers[0], `f8s_qr_a_${suffix}`, tableNumbers[1], `f8s_qr_b_${suffix}`]
  );
  const tableByNumber = new Map(tables.rows.map((table) => [table.table_number, table.id]));
  const orders = await query(
    `INSERT INTO orders
       (order_code, table_id, status, payment_method, total_amount, tracking_token_hash)
     VALUES
       ($1, $2, 'preparing', 'cash', 24.68, $3),
       ($4, $5, 'new', 'pay_at_table', 9.50, $6)
     RETURNING id, order_code`,
    [
      orderCodes[0],
      tableByNumber.get(tableNumbers[0]),
      hashTrackingToken(firstToken),
      orderCodes[1],
      tableByNumber.get(tableNumbers[1]),
      hashTrackingToken(secondToken),
    ]
  );
  const orderByCode = new Map(orders.rows.map((order) => [order.order_code, order.id]));

  await query(
    `INSERT INTO order_items
       (order_id, item_name_snapshot, unit_price_snapshot, quantity,
        special_instructions, subtotal)
     VALUES
       ($1, 'Tracked Burger', 12.34, 2, 'No onions', 24.68),
       ($2, 'Other Item', 9.50, 1, NULL, 9.50)`,
    [orderByCode.get(orderCodes[0]), orderByCode.get(orderCodes[1])]
  );

  const trackedOrder = await getCustomerTrackedOrder({
    orderId: orderCodes[0],
    trackingToken: firstToken,
  });

  check(trackedOrder.orderId === orderCodes[0], 'The correct public Order ID must be returned.');
  check(trackedOrder.tableNumber === tableNumbers[0], 'The correct table must be returned.');
  check(trackedOrder.status === 'preparing', 'The current database status must be returned.');
  check(trackedOrder.paymentMethod === 'cash', 'The payment method must be returned.');
  check(trackedOrder.totalAmount === '24.68', 'The trusted total must be returned.');
  check(Boolean(trackedOrder.orderTime), 'The database order time must be returned.');
  check(Boolean(trackedOrder.updatedAt), 'The database update time must be returned.');
  check(trackedOrder.items.length === 1, 'Historical order items must be returned.');
  check(trackedOrder.items[0].name === 'Tracked Burger', 'The historical item name must be used.');
  check(trackedOrder.items[0].unitPrice === '12.34', 'The historical unit price must be used.');
  check(trackedOrder.items[0].quantity === 2, 'The stored quantity must be returned.');
  check(
    trackedOrder.items[0].specialInstructions === 'No onions',
    'Stored item instructions must be returned.'
  );
  check(trackedOrder.items[0].subtotal === '24.68', 'The historical subtotal must be used.');

  const serializedOrder = JSON.stringify(trackedOrder);
  check(!serializedOrder.includes('trackingToken'), 'The response must exclude raw tracking tokens.');
  check(!serializedOrder.includes('tracking_token'), 'The response must exclude tracking hashes.');
  check(!('id' in trackedOrder), 'The response must exclude internal order IDs.');

  await expectNotFound(() => getCustomerTrackedOrder({
    orderId: orderCodes[0],
    trackingToken: generateTrackingToken(),
  }));
  await expectNotFound(() => getCustomerTrackedOrder({
    orderId: 'F8S-UNKNOWN-ORDER',
    trackingToken: firstToken,
  }));
  await expectNotFound(() => getCustomerTrackedOrder({
    orderId: orderCodes[1],
    trackingToken: firstToken,
  }));
  await expectNotFound(() => getCustomerTrackedOrder({
    orderId: orderCodes[0],
    trackingToken: 'malformed',
  }));
  await expectNotFound(() => getCustomerTrackedOrder({
    orderId: orderCodes[0],
    trackingToken: undefined,
  }));

  console.log(`FR-08 customer order tracking service tests passed (${assertions}/${assertions}).`);
} finally {
  await cleanup();
  const remaining = await query(
    `SELECT COUNT(*)::INTEGER AS count FROM orders WHERE order_code = ANY($1::TEXT[])`,
    [orderCodes]
  );
  console.log(
    `FR-08 customer order tracking service cleanup verified (${remaining.rows[0].count} orders).`
  );
  await closePool();
}
