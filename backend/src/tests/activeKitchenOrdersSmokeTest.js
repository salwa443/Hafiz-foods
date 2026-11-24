import http from 'http';
import app from '../app.js';
import { closePool, query } from '../config/db.js';
import { createGetActiveKitchenOrdersHandler } from '../controllers/kitchenOrderController.js';
import { generateToken } from '../services/authService.js';

const suffix = Date.now();
const tableNumber = `F6A${String(suffix).slice(-10)}`;
const qrToken = `fr06_active_orders_${suffix}`;
const statuses = ['new', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'];
const orderCodes = Object.fromEntries(
  statuses.map((status) => [status, `F6-${status.toUpperCase()}-${suffix}`])
);
const emails = {
  kitchen: `fr06.active.kitchen.${suffix}@example.com`,
  waiter: `fr06.active.waiter.${suffix}@example.com`,
  admin: `fr06.active.admin.${suffix}@example.com`,
};
const results = [];

function record(test, passed, detail = '') {
  results.push({ test, status: passed ? 'PASS' : 'FAIL', detail });
}

async function cleanup() {
  await query(
    `DELETE FROM orders WHERE table_id IN
      (SELECT id FROM restaurant_tables WHERE table_number = $1)`,
    [tableNumber]
  );
  await query('DELETE FROM restaurant_tables WHERE table_number = $1', [tableNumber]);
  await query('DELETE FROM users WHERE email = ANY($1::TEXT[])', [Object.values(emails)]);
}

async function createUser(role, email) {
  const result = await query(
    `INSERT INTO users (role_id, name, email, password_hash, is_active)
     VALUES ((SELECT id FROM roles WHERE name = $1), $2, $3, $4, TRUE)
     RETURNING id, name, email, is_active`,
    [role, `FR06 Active ${role}`, email, 'active-orders-test-password-placeholder']
  );
  return { ...result.rows[0], role };
}

async function request(baseUrl, token) {
  return fetch(`${baseUrl}/api/kitchen/orders/active`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const run = async () => {
  const server = http.createServer(app);

  try {
    await cleanup();
    const table = await query(
      `INSERT INTO restaurant_tables (table_number, status, is_active, qr_token)
       VALUES ($1, 'available', TRUE, $2) RETURNING id`,
      [tableNumber, qrToken]
    );
    const users = {
      kitchen: await createUser('kitchen', emails.kitchen),
      waiter: await createUser('waiter', emails.waiter),
      admin: await createUser('admin', emails.admin),
    };

    for (let index = 0; index < statuses.length; index += 1) {
      const status = statuses[index];
      const order = await query(
        `INSERT INTO orders
          (order_code, table_id, status, payment_method, total_amount, order_time)
         VALUES ($1, $2, $3, 'cash', 10.00, $4)
         RETURNING id`,
        [
          orderCodes[status],
          table.rows[0].id,
          status,
          new Date(Date.UTC(2035, 0, 1, 10, index, 0)),
        ]
      );
      await query(
        `INSERT INTO order_items
          (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot,
           quantity, special_instructions, subtotal)
         VALUES ($1, NULL, $2, 5.00, $3, $4, 10.00)`,
        [order.rows[0].id, `Historical ${status} item`, index + 1, `Instruction ${status}`]
      );
    }

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const kitchenResponse = await request(baseUrl, generateToken(users.kitchen));
    const kitchenBody = await kitchenResponse.json();
    const returnedOrders = kitchenBody.data?.orders || [];
    const testOrders = returnedOrders.filter((order) => Object.values(orderCodes).includes(order.orderId));
    const returnedCodes = testOrders.map((order) => order.orderId);

    record('kitchen user can retrieve active orders', kitchenResponse.status === 200 && kitchenBody.success === true);
    record('new orders are included', returnedCodes.includes(orderCodes.new));
    record('accepted orders are included', returnedCodes.includes(orderCodes.accepted));
    record('preparing orders are included', returnedCodes.includes(orderCodes.preparing));
    record('ready orders are included', returnedCodes.includes(orderCodes.ready));
    record('completed orders are excluded', !returnedCodes.includes(orderCodes.completed));
    record('cancelled orders are excluded', !returnedCodes.includes(orderCodes.cancelled));
    record(
      'orders are sorted oldest first',
      returnedCodes.indexOf(orderCodes.new) < returnedCodes.indexOf(orderCodes.accepted) &&
        returnedCodes.indexOf(orderCodes.accepted) < returnedCodes.indexOf(orderCodes.preparing) &&
        returnedCodes.indexOf(orderCodes.preparing) < returnedCodes.indexOf(orderCodes.ready)
    );
    const newOrder = testOrders.find((order) => order.orderId === orderCodes.new);
    record('item names use historical snapshots', newOrder?.items[0]?.name === 'Historical new item');
    record(
      'special instructions and quantities are correct',
      newOrder?.items[0]?.specialInstructions === 'Instruction new' && newOrder?.items[0]?.quantity === 1
    );
    record(
      'response excludes internal IDs, payment and prices',
      !('id' in newOrder) &&
        !('paymentMethod' in newOrder) &&
        !('totalAmount' in newOrder) &&
        !('unitPrice' in newOrder.items[0]) &&
        !JSON.stringify(kitchenBody).includes(qrToken)
    );

    const unauthorizedResponse = await request(baseUrl);
    record('unauthorized requests are rejected', unauthorizedResponse.status === 401);
    const waiterResponse = await request(baseUrl, generateToken(users.waiter));
    const adminResponse = await request(baseUrl, generateToken(users.admin));
    record(
      'waiter and other unauthorized roles are rejected',
      waiterResponse.status === 403 && adminResponse.status === 403
    );

    let emptyBody;
    const emptyHandler = createGetActiveKitchenOrdersHandler(async () => []);
    await emptyHandler(
      {},
      { status: () => ({ json: (body) => { emptyBody = body; } }) },
      () => {}
    );
    record(
      'empty result returns a valid response',
      emptyBody?.success === true && Array.isArray(emptyBody.data?.orders) && emptyBody.data.orders.length === 0
    );

    let safeDatabaseError;
    const failingHandler = createGetActiveKitchenOrdersHandler(async () => {
      throw new Error('sensitive SQL connection detail');
    });
    await failingHandler({}, {}, (error) => { safeDatabaseError = error; });
    record(
      'database failures are sanitized',
      safeDatabaseError?.statusCode === 500 &&
        safeDatabaseError.message === 'Unable to load active kitchen orders.' &&
        !safeDatabaseError.message.includes('SQL')
    );

    console.table(results);
    if (results.some((result) => result.status === 'FAIL')) process.exitCode = 1;
  } finally {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    await cleanup();
    await closePool();
  }
};

run().catch((error) => {
  console.error('FR-06 active kitchen orders tests failed:', error);
  process.exitCode = 1;
});
