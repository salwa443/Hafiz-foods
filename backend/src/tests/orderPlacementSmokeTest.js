import app from '../app.js';
import { closePool, query } from '../config/db.js';
import {
  formatMinorUnits,
  parseDecimalToMinorUnits,
} from '../services/orderService.js';
import {
  isValidTrackingToken,
  verifyTrackingToken,
} from '../utils/trackingToken.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const postOrder = (baseUrl, tableNumber, token, body) =>
  fetch(
    `${baseUrl}/api/public/tables/${encodeURIComponent(tableNumber)}/orders?token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

const cleanup = async ({ tableNumbers, itemNames, categoryNames }) => {
  await query(
    `DELETE FROM orders
     WHERE table_id IN (
       SELECT id FROM restaurant_tables WHERE table_number = ANY($1::TEXT[])
     )`,
    [tableNumbers]
  );
  await query('DELETE FROM menu_items WHERE name = ANY($1::TEXT[])', [itemNames]);
  await query('DELETE FROM categories WHERE name = ANY($1::TEXT[])', [categoryNames]);
  await query('DELETE FROM restaurant_tables WHERE table_number = ANY($1::TEXT[])', [
    tableNumbers,
  ]);
};

const run = async () => {
  const suffix = `${Date.now()}`;
  const names = {
    categories: [`FR05_ACTIVE_${suffix}`, `FR05_INACTIVE_${suffix}`],
    items: [
      `FR05_VALID_${suffix}`,
      `FR05_ZERO_${suffix}`,
      `FR05_UNAVAILABLE_${suffix}`,
      `FR05_INACTIVE_${suffix}`,
      `FR05_BAD_CATEGORY_${suffix}`,
    ],
    tables: [`F5A${suffix.slice(-10)}`, `F5B${suffix.slice(-10)}`, `F5I${suffix.slice(-10)}`],
  };
  const tokens = {
    first: `fr05_token_a_${suffix}`,
    second: `fr05_token_b_${suffix}`,
    inactive: `fr05_token_i_${suffix}`,
  };
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  let assertions = 0;
  const check = (condition, message) => {
    assert(condition, message);
    assertions += 1;
  };

  try {
    await cleanup({
      tableNumbers: names.tables,
      itemNames: names.items,
      categoryNames: names.categories,
    });

    const activeCategory = await query(
      'INSERT INTO categories (name, display_order, is_active) VALUES ($1, 950, TRUE) RETURNING id',
      [names.categories[0]]
    );
    const inactiveCategory = await query(
      'INSERT INTO categories (name, display_order, is_active) VALUES ($1, 951, FALSE) RETURNING id',
      [names.categories[1]]
    );
    const activeCategoryId = activeCategory.rows[0].id;
    const inactiveCategoryId = inactiveCategory.rows[0].id;

    const items = await query(
      `INSERT INTO menu_items
        (category_id, name, description, price, is_available, is_active)
       VALUES
        ($1, $2, 'Trusted price item', 12.34, TRUE, TRUE),
        ($1, $3, 'Zero price item', 0.00, TRUE, TRUE),
        ($1, $4, 'Unavailable item', 4.00, FALSE, TRUE),
        ($1, $5, 'Inactive item', 5.00, TRUE, FALSE),
        ($6, $7, 'Inactive category item', 6.00, TRUE, TRUE)
       RETURNING id, name`,
      [
        activeCategoryId,
        names.items[0],
        names.items[1],
        names.items[2],
        names.items[3],
        inactiveCategoryId,
        names.items[4],
      ]
    );
    const itemIds = Object.fromEntries(items.rows.map((item) => [item.name, item.id]));

    await query(
      `INSERT INTO restaurant_tables
        (table_number, status, is_active, qr_token)
       VALUES
        ($1, 'available', TRUE, $2),
        ($3, 'occupied', TRUE, $4),
        ($5, 'inactive', FALSE, $6)`,
      [names.tables[0], tokens.first, names.tables[1], tokens.second, names.tables[2], tokens.inactive]
    );

    check(parseDecimalToMinorUnits('12.34') === 1234n, 'Decimal parsing must be exact.');
    check(parseDecimalToMinorUnits('0.1') === 10n, 'One decimal place must parse exactly.');
    check(formatMinorUnits(1234n) === '12.34', 'Minor units must format exactly.');

    const successfulOrders = [];
    for (const paymentMethod of ['cash', 'pay_at_counter', 'pay_at_table']) {
      const response = await postOrder(baseUrl, names.tables[0], tokens.first, {
        paymentMethod,
        totalAmount: '0.01',
        items: [
          {
            menuItemId: itemIds[names.items[0]],
            quantity: 1,
            specialInstructions: '  no onions  ',
            price: '0.01',
            subtotal: '0.01',
          },
        ],
      });
      const body = await response.json();
      check(response.status === 201, `${paymentMethod} order should succeed without JWT.`);
      check(body.data.order.paymentMethod === paymentMethod, `${paymentMethod} must be recorded.`);
      check(body.data.order.totalAmount === '12.34', 'Client prices and totals must be ignored.');
      check(/^ORD-[0-9a-f-]{36}$/.test(body.data.order.orderId), 'Order ID must contain a UUID.');
      check(body.data.order.tableNumber === names.tables[0], 'Validated table number must be returned.');
      check(!('id' in body.data.order), 'Internal order ID must not be exposed.');
      check(!JSON.stringify(body).includes(tokens.first), 'QR token must not be exposed.');
      check(
        isValidTrackingToken(body.data.order.trackingToken),
        'Successful orders must return a valid tracking token.'
      );
      successfulOrders.push({
        orderId: body.data.order.orderId,
        trackingToken: body.data.order.trackingToken,
      });
    }
    check(
      new Set(successfulOrders.map((order) => order.orderId)).size === 3,
      'Public Order IDs must be unique.'
    );
    check(
      new Set(successfulOrders.map((order) => order.trackingToken)).size === 3,
      'Each order must receive a different tracking token.'
    );

    const stored = await query(
      `SELECT o.order_code, o.total_amount::TEXT, o.payment_method,
              o.tracking_token_hash,
              oi.item_name_snapshot, oi.unit_price_snapshot::TEXT,
              oi.quantity, oi.special_instructions, oi.subtotal::TEXT
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.order_code = ANY($1::TEXT[])
       ORDER BY o.order_code`,
      [successfulOrders.map((order) => order.orderId)]
    );
    check(stored.rowCount === 3, 'All successful orders and their items must be stored.');
    check(
      stored.rows.every(
        (row) =>
          row.total_amount === '12.34' &&
          row.item_name_snapshot === names.items[0] &&
          row.unit_price_snapshot === '12.34' &&
          row.subtotal === '12.34' &&
          row.special_instructions === 'no onions'
      ),
      'Database totals, name/price snapshots, and normalized instructions must be trusted and exact.'
    );
    check(
      stored.rows.every((row) => {
        const placedOrder = successfulOrders.find(
          (order) => order.orderId === row.order_code
        );

        return placedOrder &&
          verifyTrackingToken(placedOrder.trackingToken, row.tracking_token_hash) &&
          row.tracking_token_hash !== placedOrder.trackingToken;
      }),
      'The database must store only hashes that verify against returned tracking tokens.'
    );

    const duplicateResponse = await postOrder(baseUrl, names.tables[0], tokens.first, {
      paymentMethod: 'cash',
      items: [
        { menuItemId: itemIds[names.items[0]], quantity: 1, specialInstructions: 'same' },
        { menuItemId: itemIds[names.items[0]], quantity: 2, specialInstructions: ' same ' },
        { menuItemId: itemIds[names.items[0]], quantity: 1, specialInstructions: 'different' },
        { menuItemId: itemIds[names.items[1]], quantity: 1, specialInstructions: '' },
      ],
    });
    const duplicateBody = await duplicateResponse.json();
    check(duplicateResponse.status === 201, 'Duplicate-line order should succeed.');
    check(duplicateBody.data.order.items.length === 3, 'Identical lines must merge; different instructions remain separate.');
    check(
      duplicateBody.data.order.items.find((item) => item.specialInstructions === 'same')?.quantity === 3,
      'Identical normalized instruction lines must aggregate quantities.'
    );
    check(duplicateBody.data.order.totalAmount === '49.36', 'Aggregated and zero-price totals must be exact.');

    const invalidPayment = await postOrder(baseUrl, names.tables[0], tokens.first, {
      paymentMethod: 'card',
      items: [{ menuItemId: itemIds[names.items[0]], quantity: 1 }],
    });
    check(invalidPayment.status === 400, 'Invalid payment method must be rejected.');
    const invalidPaymentBody = await invalidPayment.json();
    check(
      !JSON.stringify(invalidPaymentBody).includes('trackingToken'),
      'Failed order placement must not return tracking credentials.'
    );

    for (const [label, tableNumber, token] of [
      ['incorrect token', names.tables[0], 'wrong_token'],
      ['cross-table token', names.tables[0], tokens.second],
      ['inactive table', names.tables[2], tokens.inactive],
    ]) {
      const response = await postOrder(baseUrl, tableNumber, token, {
        paymentMethod: 'cash',
        items: [{ menuItemId: itemIds[names.items[0]], quantity: 1 }],
      });
      const body = await response.json();
      check(response.status === 404, `${label} must be rejected.`);
      check(body.message === 'Invalid or expired QR code.', `${label} must use a generic QR error.`);
    }

    for (const [label, menuItemId] of [
      ['unavailable item', itemIds[names.items[2]]],
      ['inactive item', itemIds[names.items[3]]],
      ['inactive category item', itemIds[names.items[4]]],
      ['unknown item', 2147483647],
    ]) {
      const response = await postOrder(baseUrl, names.tables[0], tokens.first, {
        paymentMethod: 'cash',
        items: [{ menuItemId, quantity: 1 }],
      });
      check(response.status === 400, `${label} must reject the entire order.`);
    }

    const beforeFailure = await query(
      `SELECT COUNT(*)::INTEGER AS count FROM orders o
       JOIN restaurant_tables t ON t.id = o.table_id
       WHERE t.table_number = $1`,
      [names.tables[0]]
    );
    const mixedResponse = await postOrder(baseUrl, names.tables[0], tokens.first, {
      paymentMethod: 'cash',
      items: [
        { menuItemId: itemIds[names.items[0]], quantity: 1 },
        { menuItemId: itemIds[names.items[2]], quantity: 1 },
      ],
    });
    const afterFailure = await query(
      `SELECT COUNT(*)::INTEGER AS count FROM orders o
       JOIN restaurant_tables t ON t.id = o.table_id
       WHERE t.table_number = $1`,
      [names.tables[0]]
    );
    check(mixedResponse.status === 400, 'Mixed valid/invalid order must fail.');
    check(
      beforeFailure.rows[0].count === afterFailure.rows[0].count,
      'Failed mixed order must not leave a partial order.'
    );

    const unauthenticatedAdmin = await fetch(`${baseUrl}/api/admin/tables`);
    check(unauthenticatedAdmin.status === 401, 'Existing admin routes must remain protected.');

    console.log(`FR-05 order placement smoke tests passed (${assertions}/${assertions}).`);
  } finally {
    await cleanup({
      tableNumbers: names.tables,
      itemNames: names.items,
      categoryNames: names.categories,
    });
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    await closePool();
  }
};

run().catch((error) => {
  console.error('FR-05 order placement smoke tests failed:', error);
  process.exitCode = 1;
});
