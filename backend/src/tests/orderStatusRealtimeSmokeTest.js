import http from 'node:http';
import assert from 'node:assert/strict';
import { io as createSocketClient } from 'socket.io-client';
import app from '../app.js';
import { closePool, query } from '../config/db.js';
import {
  KITCHEN_SOCKET_ROOM,
  SOCKET_EVENTS,
  buildCustomerOrderRoom,
  closeSocketServer,
  initializeSocketServer,
} from '../realtime/socketServer.js';
import { generateToken } from '../services/authService.js';
import {
  buildCustomerOrderStatusPayload,
  buildKitchenOrderStatusPayload,
  publishOrderStatusUpdated,
} from '../services/orderStatusRealtimeService.js';
import { updateOrderStatus } from '../services/orderStatusService.js';
import { generateTrackingToken, hashTrackingToken } from '../utils/trackingToken.js';

const suffix = Date.now();
const tableNumber = `F7R${String(suffix).slice(-10)}`;
const qrToken = `fr07_realtime_${suffix}`;
const orderPrefix = `F7R-${suffix}`;
const kitchenEmail = `fr07.realtime.kitchen.${suffix}@example.com`;
let tableId;
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

async function cleanup() {
  await query('DELETE FROM orders WHERE order_code LIKE $1', [`${orderPrefix}%`]);
  await query('DELETE FROM restaurant_tables WHERE table_number = $1', [tableNumber]);
  await query('DELETE FROM users WHERE email = $1', [kitchenEmail]);
}

async function createOrder(label, status = 'new') {
  const orderCode = `${orderPrefix}-${label}`;
  const result = await query(
    `INSERT INTO orders
      (order_code, table_id, status, payment_method, total_amount)
     VALUES ($1, $2, $3, 'cash', 10.00)
     RETURNING id`,
    [orderCode, tableId, status]
  );
  await query(
    `INSERT INTO order_items
      (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot,
       quantity, special_instructions, subtotal)
     VALUES ($1, NULL, $2, 5.00, 2, 'Realtime instruction', 10.00)`,
    [result.rows[0].id, `Realtime Snapshot ${label}`]
  );
  return orderCode;
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
    socket.once('connect_error', reject);
  });
}

function waitForStatusEvent(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Status event timed out.')), 4000);
    socket.once(SOCKET_EVENTS.KITCHEN_ORDER_STATUS_UPDATED, (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

async function patchKitchen(baseUrl, orderId, status, token) {
  return fetch(`${baseUrl}/api/kitchen/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
}

async function cancelCustomer(baseUrl, orderId, trackingToken) {
  return fetch(
    `${baseUrl}/api/public/tables/${tableNumber}/orders/${encodeURIComponent(orderId)}/cancel`,
    {
      method: 'PATCH',
      headers: { 'X-Order-Tracking-Token': trackingToken },
    }
  );
}

async function run() {
  const httpServer = http.createServer(app);
  initializeSocketServer(httpServer);
  let kitchenClient;

  try {
    await cleanup();
    const table = await query(
      `INSERT INTO restaurant_tables (table_number, status, is_active, qr_token)
       VALUES ($1, 'available', TRUE, $2) RETURNING id`,
      [tableNumber, qrToken]
    );
    tableId = table.rows[0].id;
    const userResult = await query(
      `INSERT INTO users (role_id, name, email, password_hash, is_active)
       VALUES ((SELECT id FROM roles WHERE name = 'kitchen'), $1, $2, $3, TRUE)
       RETURNING id, name, email, is_active`,
      ['FR07 Realtime Kitchen', kitchenEmail, 'realtime-test-password-placeholder']
    );
    const kitchenUser = { ...userResult.rows[0], role: 'kitchen' };

    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
    kitchenClient = await connectKitchen(baseUrl, generateToken(kitchenUser));

    const kitchenOrder = await createOrder('KITCHEN');
    let statusEventCount = 0;
    kitchenClient.on(SOCKET_EVENTS.KITCHEN_ORDER_STATUS_UPDATED, () => {
      statusEventCount += 1;
    });
    const kitchenEventPromise = waitForStatusEvent(kitchenClient);
    const kitchenResponse = await patchKitchen(baseUrl, kitchenOrder, 'accepted', generateToken(kitchenUser));
    const kitchenEvent = await kitchenEventPromise;
    await new Promise((resolve) => setTimeout(resolve, 40));
    check(kitchenResponse.status === 200, 'Kitchen status REST update should succeed.');
    check(statusEventCount === 1, 'Kitchen transition should emit exactly one kitchen event.');
    check(kitchenEvent.orderId === kitchenOrder, 'Kitchen event should contain public Order ID.');
    check(kitchenEvent.tableNumber === tableNumber, 'Kitchen event should contain table number.');
    check(kitchenEvent.status === 'accepted', 'Kitchen event should contain committed status.');
    check(Boolean(kitchenEvent.orderTime) && Boolean(kitchenEvent.updatedAt), 'Kitchen event should contain timestamps.');
    check(kitchenEvent.items[0].name === 'Realtime Snapshot KITCHEN', 'Kitchen event should use historical snapshot.');
    check(kitchenEvent.items[0].quantity === 2, 'Kitchen event should contain quantity.');
    check(kitchenEvent.items[0].specialInstructions === 'Realtime instruction', 'Kitchen event should contain instructions.');
    check(!('id' in kitchenEvent) && !('paymentMethod' in kitchenEvent), 'Kitchen event should exclude sensitive fields.');

    const customerOrder = await createOrder('CUSTOMER');
    const customerTrackingToken = generateTrackingToken();
    await query(
      'UPDATE orders SET tracking_token_hash = $1 WHERE order_code = $2',
      [hashTrackingToken(customerTrackingToken), customerOrder]
    );
    const customerEventPromise = waitForStatusEvent(kitchenClient);
    const cancellationResponse = await cancelCustomer(
      baseUrl,
      customerOrder,
      customerTrackingToken
    );
    const cancellationEvent = await customerEventPromise;
    await new Promise((resolve) => setTimeout(resolve, 40));
    check(cancellationResponse.status === 200, 'Customer cancellation REST update should succeed.');
    check(cancellationEvent.orderId === customerOrder, 'Cancellation event should identify the order.');
    check(cancellationEvent.status === 'cancelled', 'Cancellation should emit cancelled status to kitchen.');
    check(statusEventCount === 2, 'Customer cancellation should emit exactly one additional kitchen event.');
    check(!('trackingToken' in cancellationEvent), 'Kitchen cancellation event must exclude tracking token.');
    check(!('trackingTokenHash' in cancellationEvent), 'Kitchen cancellation event must exclude tracking hash.');

    const eventCountBeforeFailures = statusEventCount;
    const skippedOrder = await createOrder('SKIPPED');
    const skippedResponse = await patchKitchen(baseUrl, skippedOrder, 'preparing', generateToken(kitchenUser));
    const duplicateResponse = await patchKitchen(baseUrl, kitchenOrder, 'accepted', generateToken(kitchenUser));
    await new Promise((resolve) => setTimeout(resolve, 100));
    check(skippedResponse.status === 409, 'Failed transition should return conflict.');
    check(duplicateResponse.status === 409, 'Duplicate transition should return conflict.');
    check(statusEventCount === eventCountBeforeFailures, 'Failed transitions must emit no events.');

    const roomCalls = [];
    const fakeIo = {
      to(room) {
        return {
          emit(event, payload) {
            roomCalls.push({ room, event, payload });
          },
        };
      },
      of(namespace) {
        return {
          to: (room) => ({
            emit: (event, payload) => {
              roomCalls.push({ namespace, room, event, payload });
            },
          }),
        };
      },
    };
    const sampleOrder = {
      orderId: `${orderPrefix}-SCOPED`,
      tableNumber,
      orderTime: new Date(),
      status: 'ready',
      updatedAt: new Date(),
      items: [{ name: 'Snapshot', quantity: 1, specialInstructions: null }],
    };
    const publishResult = publishOrderStatusUpdated(sampleOrder, fakeIo);
    const customerCall = roomCalls.find(
      (call) => call.event === SOCKET_EVENTS.CUSTOMER_ORDER_STATUS_UPDATED
    );
    check(publishResult.kitchenPublished && publishResult.customerPublished, 'Both publication contracts should succeed.');
    check(roomCalls.filter((call) => call.room === KITCHEN_SOCKET_ROOM).length === 1, 'Kitchen event should target only kitchen room.');
    check(customerCall?.room === buildCustomerOrderRoom(sampleOrder.orderId), 'Customer event should target matching order room only.');
    check(Object.keys(customerCall.payload).length === 4, 'Customer payload should contain only four public fields.');
    check(!('items' in customerCall.payload) && !('orderTime' in customerCall.payload), 'Customer payload should exclude kitchen details.');
    check(buildKitchenOrderStatusPayload(sampleOrder).items.length === 1, 'Kitchen payload builder should preserve snapshots.');
    check(buildCustomerOrderStatusPayload(sampleOrder).status === 'ready', 'Customer payload builder should preserve status.');

    let rollbackPublishCount = 0;
    const rollbackClient = {
      async query(sql) {
        if (sql === 'BEGIN') return { rows: [] };
        if (sql.includes('FOR UPDATE')) {
          return { rows: [{
            id: 999,
            order_code: `${orderPrefix}-ROLLBACK`,
            table_id: tableId,
            status: 'new',
            order_time: new Date(),
            updated_at: new Date(),
            table_number: tableNumber,
          }] };
        }
        if (sql.includes('UPDATE orders')) throw new Error('simulated rollback');
        if (sql === 'ROLLBACK') return { rows: [] };
        throw new Error(`Unexpected rollback SQL: ${sql}`);
      },
      release() {},
    };
    await updateOrderStatus(
      { orderId: `${orderPrefix}-ROLLBACK`, targetStatus: 'accepted', actor: 'kitchen' },
      {
        pool: { connect: async () => rollbackClient },
        publishStatus: () => { rollbackPublishCount += 1; },
      }
    ).then(
      () => assert.fail('Rollback update should reject.'),
      () => {}
    );
    check(rollbackPublishCount === 0, 'Database rollback must not publish a status event.');

    const publisherFailureOrder = await createOrder('PUBLISHER-FAILURE');
    const committedDespiteFailure = await updateOrderStatus(
      { orderId: publisherFailureOrder, targetStatus: 'accepted', actor: 'kitchen' },
      { publishStatus: () => { throw new Error('socket unavailable'); } }
    );
    const storedFailureOrder = await query('SELECT status FROM orders WHERE order_code = $1', [publisherFailureOrder]);
    check(committedDespiteFailure.status === 'accepted', 'Publishing failure must not reject committed update.');
    check(storedFailureOrder.rows[0].status === 'accepted', 'Publishing failure must not roll back database status.');

    const unavailableResult = publishOrderStatusUpdated(sampleOrder, null);
    check(!unavailableResult.kitchenPublished && !unavailableResult.customerPublished, 'Unavailable Socket.IO should be harmless.');

    console.log(`FR-07 order status realtime tests passed (${assertions}/${assertions}).`);
  } finally {
    kitchenClient?.disconnect();
    await closeSocketServer();
    if (httpServer.listening) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await cleanup();
    const remainingOrders = await query(
      'SELECT COUNT(*)::INTEGER AS count FROM orders WHERE order_code LIKE $1',
      [`${orderPrefix}%`]
    );
    assert.equal(remainingOrders.rows[0].count, 0);
    console.log('FR-07 order status realtime cleanup verified (0 orders).');
    await closePool();
  }
}

run().catch((error) => {
  console.error('FR-07 order status realtime tests failed:', error);
  process.exitCode = 1;
});
