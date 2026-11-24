import http from 'node:http';
import assert from 'node:assert/strict';
import { io as createSocketClient } from 'socket.io-client';
import app from '../app.js';
import { closePool, query } from '../config/db.js';
import {
  CUSTOMER_SOCKET_NAMESPACE,
  KITCHEN_SOCKET_ROOM,
  SOCKET_EVENTS,
  buildCustomerOrderRoom,
  closeSocketServer,
  initializeSocketServer,
} from '../realtime/socketServer.js';
import { generateToken } from '../services/authService.js';
import { updateOrderStatus } from '../services/orderStatusService.js';

const suffix = Date.now();
const tableNumbers = {
  first: `F7S${String(suffix).slice(-9)}A`,
  second: `F7S${String(suffix).slice(-9)}B`,
  inactive: `F7S${String(suffix).slice(-9)}I`,
};
const tokens = {
  first: `fr07_socket_first_${suffix}`,
  second: `fr07_socket_second_${suffix}`,
  inactive: `fr07_socket_inactive_${suffix}`,
  regenerated: `fr07_socket_regenerated_${suffix}`,
};
const orderPrefix = `F7S-${suffix}`;
const kitchenEmail = `fr07.socket.kitchen.${suffix}@example.com`;
const tableIds = {};
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

async function cleanup() {
  await query('DELETE FROM orders WHERE order_code LIKE $1', [`${orderPrefix}%`]);
  await query('DELETE FROM restaurant_tables WHERE table_number = ANY($1::TEXT[])', [Object.values(tableNumbers)]);
  await query('DELETE FROM users WHERE email = $1', [kitchenEmail]);
}

async function createOrder(label, tableId = tableIds.first) {
  const orderCode = `${orderPrefix}-${label}`;
  const result = await query(
    `INSERT INTO orders (order_code, table_id, status, payment_method, total_amount)
     VALUES ($1, $2, 'new', 'cash', 5.00) RETURNING id`,
    [orderCode, tableId]
  );
  await query(
    `INSERT INTO order_items
      (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot,
       quantity, special_instructions, subtotal)
     VALUES ($1, NULL, $2, 5.00, 1, NULL, 5.00)`,
    [result.rows[0].id, `Socket Snapshot ${label}`]
  );
  return orderCode;
}

function customerSocket(url, auth) {
  return createSocketClient(`${url}${CUSTOMER_SOCKET_NAMESPACE}`, {
    auth,
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
}

function defaultSocket(url, auth) {
  return createSocketClient(url, {
    auth,
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
}

function connect(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket connection timed out.')), 4000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.connect();
  });
}

function rejectConnection(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket rejection timed out.')), 4000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      reject(new Error('Unauthorized socket connected.'));
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      resolve(error);
    });
    socket.connect();
  });
}

const customerAuth = (tableNumber, orderId, token) => ({ tableNumber, orderId, token });

async function run() {
  const httpServer = http.createServer(app);
  const io = initializeSocketServer(httpServer);
  const clients = [];
  const capturedLogs = [];
  const originalLog = console.log;

  try {
    console.log = (...values) => capturedLogs.push(values.join(' '));
    await cleanup();
    for (const [key, tableNumber] of Object.entries(tableNumbers)) {
      const result = await query(
        `INSERT INTO restaurant_tables (table_number, status, is_active, qr_token)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [tableNumber, key === 'inactive' ? 'inactive' : 'available', key !== 'inactive', tokens[key]]
      );
      tableIds[key] = result.rows[0].id;
    }
    const firstOrder = await createOrder('FIRST');
    const secondOrder = await createOrder('SECOND');
    const crossTableOrder = await createOrder('CROSS', tableIds.second);
    const inactiveOrder = await createOrder('INACTIVE', tableIds.inactive);
    const kitchenResult = await query(
      `INSERT INTO users (role_id, name, email, password_hash, is_active)
       VALUES ((SELECT id FROM roles WHERE name = 'kitchen'), $1, $2, $3, TRUE)
       RETURNING id, name, email, is_active`,
      ['FR07 Socket Kitchen', kitchenEmail, 'socket-test-password-placeholder']
    );
    const kitchenUser = { ...kitchenResult.rows[0], role: 'kitchen' };

    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${httpServer.address().port}`;

    const firstCustomer = customerSocket(url, customerAuth(tableNumbers.first, firstOrder, tokens.first));
    clients.push(firstCustomer);
    await connect(firstCustomer);
    check(firstCustomer.connected, 'Valid QR and matching order should connect.');

    const customerNamespace = io.of(CUSTOMER_SOCKET_NAMESPACE);
    const firstRoom = buildCustomerOrderRoom(firstOrder);
    const firstRoomMembers = await customerNamespace.in(firstRoom).fetchSockets();
    check(firstRoomMembers.length === 1, 'Customer should join its matching order room.');
    check(
      [...firstRoomMembers[0].rooms].every((room) => room === firstRoomMembers[0].id || room === firstRoom),
      'Customer should join only its socket room and matching order room.'
    );
    check(!(await io.in(KITCHEN_SOCKET_ROOM).fetchSockets()).some((socket) => socket.id === firstCustomer.id), 'Customer must not join kitchen room.');

    for (const [label, auth] of [
      ['missing token', { tableNumber: tableNumbers.first, orderId: firstOrder }],
      ['invalid token', customerAuth(tableNumbers.first, firstOrder, 'valid_but_wrong_token')],
      ['missing table', { orderId: firstOrder, token: tokens.first }],
      ['missing order', { tableNumber: tableNumbers.first, token: tokens.first }],
      ['unknown order', customerAuth(tableNumbers.first, `${orderPrefix}-UNKNOWN`, tokens.first)],
      ['cross-table order', customerAuth(tableNumbers.first, crossTableOrder, tokens.first)],
      ['inactive table', customerAuth(tableNumbers.inactive, inactiveOrder, tokens.inactive)],
    ]) {
      const client = customerSocket(url, auth);
      clients.push(client);
      const error = await rejectConnection(client);
      check(error.message === 'Socket authentication failed.', `${label} should use sanitized rejection.`);
    }

    await query('UPDATE restaurant_tables SET qr_token = $1 WHERE id = $2', [tokens.regenerated, tableIds.first]);
    const oldTokenClient = customerSocket(url, customerAuth(tableNumbers.first, secondOrder, tokens.first));
    clients.push(oldTokenClient);
    const oldTokenError = await rejectConnection(oldTokenClient);
    check(oldTokenError.data?.code === 'AUTH_INVALID', 'Regenerated token should be rejected.');

    const secondCustomer = customerSocket(url, customerAuth(tableNumbers.first, secondOrder, tokens.regenerated));
    clients.push(secondCustomer);
    await connect(secondCustomer);
    secondCustomer.emit('join', KITCHEN_SOCKET_ROOM);
    secondCustomer.emit('join', buildCustomerOrderRoom(firstOrder));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const secondServerSocket = (await customerNamespace.in(buildCustomerOrderRoom(secondOrder)).fetchSockets())[0];
    check(!secondServerSocket.rooms.has(KITCHEN_SOCKET_ROOM), 'Customer join event cannot add kitchen room.');
    check(!secondServerSocket.rooms.has(buildCustomerOrderRoom(firstOrder)), 'Customer join event cannot add another order room.');

    const customerOnKitchen = defaultSocket(url, customerAuth(tableNumbers.first, secondOrder, tokens.regenerated));
    clients.push(customerOnKitchen);
    const kitchenNamespaceError = await rejectConnection(customerOnKitchen);
    check(kitchenNamespaceError.data?.code === 'AUTH_INVALID', 'Customer credentials cannot access kitchen namespace.');

    const kitchenToken = generateToken(kitchenUser);
    const kitchenClient = defaultSocket(url, { token: kitchenToken });
    clients.push(kitchenClient);
    await connect(kitchenClient);
    check((await io.in(KITCHEN_SOCKET_ROOM).fetchSockets()).length === 1, 'Existing kitchen JWT and room behavior should remain valid.');
    const kitchenOnCustomer = customerSocket(url, { token: kitchenToken });
    clients.push(kitchenOnCustomer);
    await rejectConnection(kitchenOnCustomer);

    let firstCustomerEvents = 0;
    let secondCustomerEvents = 0;
    firstCustomer.on(SOCKET_EVENTS.CUSTOMER_ORDER_STATUS_UPDATED, () => { firstCustomerEvents += 1; });
    secondCustomer.on(SOCKET_EVENTS.CUSTOMER_ORDER_STATUS_UPDATED, () => { secondCustomerEvents += 1; });
    await updateOrderStatus({ orderId: secondOrder, targetStatus: 'accepted', actor: 'kitchen' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    check(secondCustomerEvents === 1, 'Matching customer room should receive its status event.');
    check(firstCustomerEvents === 0, 'Other customer order rooms must not receive the update.');

    secondCustomer.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    check((await customerNamespace.in(buildCustomerOrderRoom(secondOrder)).fetchSockets()).length === 0, 'Disconnect should remove customer room membership safely.');

    check(!capturedLogs.join(' ').includes(tokens.first), 'QR token must not appear in application logs.');
    check(!capturedLogs.join(' ').includes(tokens.regenerated), 'Regenerated QR token must not appear in logs.');

    originalLog(`FR-07 customer socket authentication tests passed (${assertions}/${assertions}).`);
  } finally {
    console.log = originalLog;
    clients.forEach((client) => client.disconnect());
    await closeSocketServer();
    if (httpServer.listening) await new Promise((resolve) => httpServer.close(resolve));
    await cleanup();
    const remainingOrders = await query('SELECT COUNT(*)::INTEGER AS count FROM orders WHERE order_code LIKE $1', [`${orderPrefix}%`]);
    assert.equal(remainingOrders.rows[0].count, 0);
    console.log('FR-07 customer socket cleanup verified (0 orders).');
    await closePool();
  }
}

run().catch((error) => {
  console.error('FR-07 customer socket authentication tests failed:', error);
  process.exitCode = 1;
});
