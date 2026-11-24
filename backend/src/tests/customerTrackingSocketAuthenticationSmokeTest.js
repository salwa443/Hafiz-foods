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
import { publishOrderStatusUpdated } from '../services/orderStatusRealtimeService.js';
import {
  generateTrackingToken,
  hashTrackingToken,
} from '../utils/trackingToken.js';

const suffix = String(Date.now());
const tableNumbers = [`F8W${suffix.slice(-9)}A`, `F8W${suffix.slice(-9)}B`];
const qrTokens = [`f8w_qr_a_${suffix}`, `f8w_qr_b_${suffix}`];
const orderCodes = [
  `F8W-${suffix}-A`,
  `F8W-${suffix}-B`,
  `F8W-${suffix}-LEGACY`,
];
const trackingTokens = [generateTrackingToken(), generateTrackingToken()];
const clients = [];
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

async function cleanup() {
  await query('DELETE FROM orders WHERE order_code = ANY($1::TEXT[])', [orderCodes]);
  await query('DELETE FROM restaurant_tables WHERE table_number = ANY($1::TEXT[])', [
    tableNumbers,
  ]);
}

function createCustomerSocket(url, auth, queryOptions) {
  const socket = createSocketClient(`${url}${CUSTOMER_SOCKET_NAMESPACE}`, {
    auth,
    query: queryOptions,
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
  clients.push(socket);
  return socket;
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

const httpServer = http.createServer(app);
const io = initializeSocketServer(httpServer);
const capturedLogs = [];
const originalLog = console.log;

try {
  console.log = (...values) => capturedLogs.push(values.join(' '));
  await cleanup();
  const tables = await query(
    `INSERT INTO restaurant_tables (table_number, qr_token, status, is_active)
     VALUES ($1, $2, 'available', TRUE), ($3, $4, 'available', TRUE)
     RETURNING id, table_number`,
    [tableNumbers[0], qrTokens[0], tableNumbers[1], qrTokens[1]]
  );
  const tableByNumber = new Map(tables.rows.map((table) => [table.table_number, table.id]));
  await query(
    `INSERT INTO orders
       (order_code, table_id, status, payment_method, total_amount, tracking_token_hash)
     VALUES
       ($1, $2, 'new', 'cash', 10.00, $3),
       ($4, $5, 'new', 'cash', 12.00, $6),
       ($7, $2, 'new', 'cash', 5.00, NULL)`,
    [
      orderCodes[0], tableByNumber.get(tableNumbers[0]), hashTrackingToken(trackingTokens[0]),
      orderCodes[1], tableByNumber.get(tableNumbers[1]), hashTrackingToken(trackingTokens[1]),
      orderCodes[2],
    ]
  );

  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const customerNamespace = io.of(CUSTOMER_SOCKET_NAMESPACE);

  const firstCustomer = createCustomerSocket(url, {
    orderId: orderCodes[0],
    trackingToken: trackingTokens[0],
  });
  await connect(firstCustomer);
  check(firstCustomer.connected, 'A valid order-specific tracking token must connect.');

  const firstRoom = buildCustomerOrderRoom(orderCodes[0]);
  const firstMembers = await customerNamespace.in(firstRoom).fetchSockets();
  check(firstMembers.length === 1, 'The customer must join its matching order room.');
  check(
    [...firstMembers[0].rooms].every(
      (room) => room === firstMembers[0].id || room === firstRoom
    ),
    'The customer must join only its own socket and order rooms.'
  );

  for (const [label, auth, queryOptions] of [
    ['missing tracking token', { orderId: orderCodes[0] }],
    ['invalid tracking token', { orderId: orderCodes[0], trackingToken: generateTrackingToken() }],
    ['cross-order tracking token', { orderId: orderCodes[1], trackingToken: trackingTokens[0] }],
    ['QR fallback for tracked order', { tableNumber: tableNumbers[0], orderId: orderCodes[0], token: qrTokens[0] }],
    ['query credential', { orderId: orderCodes[0] }, { trackingToken: 'query-credentials-are-ignored' }],
  ]) {
    const client = createCustomerSocket(url, auth, queryOptions);
    const error = await rejectConnection(client);
    check(error.message === 'Socket authentication failed.', `${label} must be rejected safely.`);
  }

  const secondCustomer = createCustomerSocket(url, {
    orderId: orderCodes[1],
    trackingToken: trackingTokens[1],
  });
  await connect(secondCustomer);
  secondCustomer.emit('join', KITCHEN_SOCKET_ROOM);
  secondCustomer.emit('join', firstRoom);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const secondServerSocket = (
    await customerNamespace.in(buildCustomerOrderRoom(orderCodes[1])).fetchSockets()
  )[0];
  check(!secondServerSocket.rooms.has(KITCHEN_SOCKET_ROOM), 'Customers cannot join the kitchen room.');
  check(!secondServerSocket.rooms.has(firstRoom), 'Customers cannot join another order room.');

  const legacyCustomer = createCustomerSocket(url, {
    tableNumber: tableNumbers[0],
    orderId: orderCodes[2],
    token: qrTokens[0],
  });
  await connect(legacyCustomer);
  check(legacyCustomer.connected, 'Legacy null-hash orders must retain QR-scoped compatibility.');

  let firstStatusEvents = 0;
  let secondStatusEvents = 0;
  let kitchenEventsOnCustomer = 0;
  firstCustomer.on(SOCKET_EVENTS.CUSTOMER_ORDER_STATUS_UPDATED, () => {
    firstStatusEvents += 1;
  });
  secondCustomer.on(SOCKET_EVENTS.CUSTOMER_ORDER_STATUS_UPDATED, () => {
    secondStatusEvents += 1;
  });
  firstCustomer.on(SOCKET_EVENTS.KITCHEN_ORDER_STATUS_UPDATED, () => {
    kitchenEventsOnCustomer += 1;
  });

  publishOrderStatusUpdated({
    orderId: orderCodes[0],
    tableNumber: tableNumbers[0],
    orderTime: new Date(),
    status: 'accepted',
    updatedAt: new Date(),
    items: [],
  }, io);
  io.to(KITCHEN_SOCKET_ROOM).emit(SOCKET_EVENTS.KITCHEN_ORDER_STATUS_UPDATED, {
    orderId: orderCodes[0],
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  check(firstStatusEvents === 1, 'Only the authorized order room must receive its status update.');
  check(secondStatusEvents === 0, 'Other customer order rooms must receive no update.');
  check(kitchenEventsOnCustomer === 0, 'Customer sockets must not receive kitchen-room events.');

  const combinedLogs = capturedLogs.join(' ');
  check(!combinedLogs.includes(trackingTokens[0]), 'Tracking tokens must not appear in logs.');
  check(!combinedLogs.includes(trackingTokens[1]), 'Other tracking tokens must not appear in logs.');
  check(
    !combinedLogs.includes(hashTrackingToken(trackingTokens[0])),
    'Tracking hashes must not appear in logs.'
  );

  originalLog(`FR-08 customer tracking socket authentication tests passed (${assertions}/${assertions}).`);
} finally {
  console.log = originalLog;
  clients.forEach((client) => client.disconnect());
  await closeSocketServer();
  if (httpServer.listening) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await cleanup();
  const remaining = await query(
    'SELECT COUNT(*)::INTEGER AS count FROM orders WHERE order_code = ANY($1::TEXT[])',
    [orderCodes]
  );
  console.log(`FR-08 customer tracking socket cleanup verified (${remaining.rows[0].count} orders).`);
  await closePool();
}
