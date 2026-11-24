import http from 'http';
import { io as createSocketClient } from 'socket.io-client';
import app from '../app.js';
import { closePool, query } from '../config/db.js';
import { generateToken } from '../services/authService.js';
import {
  KITCHEN_SOCKET_ROOM,
  SOCKET_EVENTS,
  closeSocketServer,
  initializeSocketServer,
} from '../realtime/socketServer.js';

const suffix = Date.now();
const names = {
  category: `FR06_BROADCAST_CATEGORY_${suffix}`,
  validItem: `FR06_BROADCAST_ITEM_${suffix}`,
  unavailableItem: `FR06_UNAVAILABLE_ITEM_${suffix}`,
  table: `F6B${String(suffix).slice(-10)}`,
  token: `fr06_broadcast_token_${suffix}`,
  users: [
    `fr06.broadcast.kitchen1.${suffix}@example.com`,
    `fr06.broadcast.kitchen2.${suffix}@example.com`,
  ],
};
const results = [];

function record(test, passed, detail = '') {
  results.push({ test, status: passed ? 'PASS' : 'FAIL', detail });
}

async function cleanup() {
  await query(
    `DELETE FROM orders WHERE table_id IN
      (SELECT id FROM restaurant_tables WHERE table_number = $1)`,
    [names.table]
  );
  await query('DELETE FROM menu_items WHERE name = ANY($1::TEXT[])', [
    [names.validItem, names.unavailableItem],
  ]);
  await query('DELETE FROM categories WHERE name = $1', [names.category]);
  await query('DELETE FROM restaurant_tables WHERE table_number = $1', [names.table]);
  await query('DELETE FROM users WHERE email = ANY($1::TEXT[])', [names.users]);
}

async function createKitchenUser(email) {
  const result = await query(
    `INSERT INTO users (role_id, name, email, password_hash, is_active)
     VALUES ((SELECT id FROM roles WHERE name = 'kitchen'), $1, $2, $3, TRUE)
     RETURNING id, name, email, is_active`,
    ['FR06 Broadcast Kitchen', email, 'socket-test-not-a-login-password']
  );
  return { ...result.rows[0], role: 'kitchen' };
}

function connectKitchen(url, token) {
  const socket = createSocketClient(url, {
    auth: { token },
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Kitchen socket timed out.')), 4000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function postOrder(baseUrl, menuItemIds) {
  return fetch(
    `${baseUrl}/api/public/tables/${names.table}/orders?token=${names.token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethod: 'cash',
        items: menuItemIds.map(({ id, quantity, specialInstructions }) => ({
          menuItemId: id,
          quantity,
          specialInstructions,
        })),
      }),
    }
  );
}

function waitForEvent(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Kitchen order event timed out.')), 4000);
    socket.once(SOCKET_EVENTS.KITCHEN_ORDER_NEW, (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

const run = async () => {
  const httpServer = http.createServer(app);
  const io = initializeSocketServer(httpServer);
  const clients = [];

  try {
    await cleanup();
    const category = await query(
      'INSERT INTO categories (name, display_order, is_active) VALUES ($1, 980, TRUE) RETURNING id',
      [names.category]
    );
    const items = await query(
      `INSERT INTO menu_items
        (category_id, name, description, price, is_available, is_active)
       VALUES
        ($1, $2, 'Broadcast test item', 12.34, TRUE, TRUE),
        ($1, $3, 'Unavailable broadcast test item', 9.50, FALSE, TRUE)
       RETURNING id, name`,
      [category.rows[0].id, names.validItem, names.unavailableItem]
    );
    const itemIds = Object.fromEntries(items.rows.map((item) => [item.name, item.id]));
    await query(
      `INSERT INTO restaurant_tables (table_number, status, is_active, qr_token)
       VALUES ($1, 'available', TRUE, $2)`,
      [names.table, names.token]
    );
    const users = await Promise.all(names.users.map(createKitchenUser));

    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
    const firstClient = await connectKitchen(baseUrl, generateToken(users[0]));
    const secondClient = await connectKitchen(baseUrl, generateToken(users[1]));
    clients.push(firstClient, secondClient);

    const roomMembers = await io.in(KITCHEN_SOCKET_ROOM).fetchSockets();
    record('both authenticated clients join the kitchen room', roomMembers.length === 2);

    let firstEventCount = 0;
    let secondEventCount = 0;
    firstClient.on(SOCKET_EVENTS.KITCHEN_ORDER_NEW, () => { firstEventCount += 1; });
    secondClient.on(SOCKET_EVENTS.KITCHEN_ORDER_NEW, () => { secondEventCount += 1; });
    const firstEventPromise = waitForEvent(firstClient);
    const secondEventPromise = waitForEvent(secondClient);
    const successResponse = await postOrder(baseUrl, [
      { id: itemIds[names.validItem], quantity: 2, specialInstructions: '  No onions  ' },
    ]);
    const successBody = await successResponse.json();
    const [firstPayload, secondPayload] = await Promise.all([
      firstEventPromise,
      secondEventPromise,
    ]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    record('successful order emits exactly one event per client', firstEventCount === 1 && secondEventCount === 1);
    record('multiple kitchen clients receive the same order', firstPayload.orderId === secondPayload.orderId);
    record(
      'event contains trusted kitchen order details',
      firstPayload.orderId === successBody.data.order.orderId &&
        firstPayload.tableNumber === names.table &&
        firstPayload.status === 'new' &&
        Boolean(firstPayload.orderTime) &&
        firstPayload.items.length === 1 &&
        firstPayload.items[0].name === names.validItem &&
        firstPayload.items[0].quantity === 2 &&
        firstPayload.items[0].specialInstructions === 'No onions'
    );
    record(
      'event excludes sensitive and unnecessary fields',
      !('id' in firstPayload) &&
        !('qrToken' in firstPayload) &&
        !('trackingToken' in firstPayload) &&
        !('trackingTokenHash' in firstPayload) &&
        !('paymentMethod' in firstPayload) &&
        !('totalAmount' in firstPayload) &&
        !('unitPrice' in firstPayload.items[0])
    );
    record(
      'existing FR-05 response remains unchanged',
      successResponse.status === 201 &&
        successBody.data.order.paymentMethod === 'cash' &&
        successBody.data.order.totalAmount === '24.68' &&
        successBody.data.order.items[0].unitPrice === '12.34' &&
        successBody.data.order.items[0].subtotal === '24.68'
    );

    const countsBeforeFailure = [firstEventCount, secondEventCount];
    const failedResponse = await postOrder(baseUrl, [
      { id: itemIds[names.unavailableItem], quantity: 1, specialInstructions: '' },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    record(
      'failed order emits no kitchen event',
      failedResponse.status === 400 &&
        firstEventCount === countsBeforeFailure[0] &&
        secondEventCount === countsBeforeFailure[1]
    );

    const ordersBeforeRollback = await query(
      `SELECT COUNT(*)::INTEGER AS count FROM orders o
       JOIN restaurant_tables t ON t.id = o.table_id WHERE t.table_number = $1`,
      [names.table]
    );
    const rollbackResponse = await postOrder(baseUrl, [
      { id: itemIds[names.validItem], quantity: 1, specialInstructions: '' },
      { id: itemIds[names.unavailableItem], quantity: 1, specialInstructions: '' },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const ordersAfterRollback = await query(
      `SELECT COUNT(*)::INTEGER AS count FROM orders o
       JOIN restaurant_tables t ON t.id = o.table_id WHERE t.table_number = $1`,
      [names.table]
    );
    record(
      'transaction rollback creates neither order nor event',
      rollbackResponse.status === 400 &&
        ordersBeforeRollback.rows[0].count === ordersAfterRollback.rows[0].count &&
        firstEventCount === countsBeforeFailure[0] &&
        secondEventCount === countsBeforeFailure[1]
    );

    secondClient.disconnect();
    const connectedClientEvent = waitForEvent(firstClient);
    const disconnectedResponse = await postOrder(baseUrl, [
      { id: itemIds[names.validItem], quantity: 1, specialInstructions: '' },
    ]);
    const connectedPayload = await connectedClientEvent;
    record(
      'disconnected kitchen client does not break order placement',
      disconnectedResponse.status === 201 && Boolean(connectedPayload.orderId)
    );

    console.table(results);
    if (results.some((result) => result.status === 'FAIL')) process.exitCode = 1;
  } finally {
    clients.forEach((client) => client.disconnect());
    await closeSocketServer();
    if (httpServer.listening) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await cleanup();
    await closePool();
  }
};

run().catch((error) => {
  console.error('FR-06 kitchen order broadcast tests failed:', error);
  process.exitCode = 1;
});
