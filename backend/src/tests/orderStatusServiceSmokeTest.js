import assert from 'node:assert/strict';
import { closePool, query } from '../config/db.js';
import {
  ORDER_STATUS_SERVICE_ERROR_CODES,
  OrderStatusServiceError,
  updateOrderStatus,
} from '../services/orderStatusService.js';

const suffix = Date.now();
const tableNumber = `F7S${String(suffix).slice(-10)}`;
const qrToken = `fr07_status_service_${suffix}`;
const orderPrefix = `F7S-${suffix}`;
const createdOrderCodes = [];
let tableId;
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

async function cleanup() {
  await query('DELETE FROM orders WHERE order_code LIKE $1', [`${orderPrefix}%`]);
  await query('DELETE FROM restaurant_tables WHERE table_number = $1', [tableNumber]);
}

async function createOrder(label, status = 'new') {
  const orderCode = `${orderPrefix}-${label}`;
  createdOrderCodes.push(orderCode);
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
     VALUES ($1, NULL, $2, 5.00, 2, 'No onions', 10.00)`,
    [result.rows[0].id, `Snapshot ${label}`]
  );
  return orderCode;
}

async function expectServiceError(promise, expectedCode, expectedStatusCode) {
  try {
    await promise;
    assert.fail(`Expected ${expectedCode}.`);
  } catch (error) {
    check(error instanceof OrderStatusServiceError, 'Failure should use OrderStatusServiceError.');
    check(error.code === expectedCode, `Expected error code ${expectedCode}, received ${error.code}.`);
    check(error.statusCode === expectedStatusCode, `Expected status ${expectedStatusCode}.`);
  }
}

async function verifyStoredStatus(orderCode, expectedStatus) {
  const result = await query('SELECT status FROM orders WHERE order_code = $1', [orderCode]);
  check(result.rows[0]?.status === expectedStatus, `${orderCode} should remain ${expectedStatus}.`);
}

async function run() {
  try {
    await cleanup();
    const table = await query(
      `INSERT INTO restaurant_tables (table_number, status, is_active, qr_token)
       VALUES ($1, 'available', TRUE, $2)
       RETURNING id`,
      [tableNumber, qrToken]
    );
    tableId = table.rows[0].id;

    const kitchenFlow = await createOrder('KITCHEN');
    for (const targetStatus of ['accepted', 'preparing', 'ready', 'completed']) {
      const updated = await updateOrderStatus({
        orderId: kitchenFlow,
        targetStatus,
        actor: 'kitchen',
      });
      check(updated.status === targetStatus, `Kitchen transition to ${targetStatus} should succeed.`);
      check(updated.orderId === kitchenFlow, 'Service should return the public Order ID.');
      check(updated.tableNumber === tableNumber, 'Service should return the table number.');
      check(updated.items[0]?.name === 'Snapshot KITCHEN', 'Service should use item snapshots.');
      check(updated.items[0]?.quantity === 2, 'Service should return item quantity.');
      check(updated.items[0]?.specialInstructions === 'No onions', 'Service should return instructions.');
      check(Boolean(updated.updatedAt), 'Service should return the database update timestamp.');
    }

    const cancellation = await createOrder('CANCEL');
    const cancelled = await updateOrderStatus({
      orderId: cancellation,
      targetStatus: 'cancelled',
      actor: 'customer',
    });
    check(cancelled.status === 'cancelled', 'Customer cancellation from new should succeed.');

    const skipped = await createOrder('SKIPPED');
    await expectServiceError(
      updateOrderStatus({ orderId: skipped, targetStatus: 'preparing', actor: 'kitchen' }),
      ORDER_STATUS_SERVICE_ERROR_CODES.INVALID_TRANSITION,
      409
    );
    await verifyStoredStatus(skipped, 'new');

    const duplicate = await createOrder('DUPLICATE', 'accepted');
    await expectServiceError(
      updateOrderStatus({ orderId: duplicate, targetStatus: 'accepted', actor: 'kitchen' }),
      ORDER_STATUS_SERVICE_ERROR_CODES.DUPLICATE_TRANSITION,
      409
    );
    await verifyStoredStatus(duplicate, 'accepted');

    const unauthorizedKitchen = await createOrder('KITCHEN-CANCEL');
    await expectServiceError(
      updateOrderStatus({
        orderId: unauthorizedKitchen,
        targetStatus: 'cancelled',
        actor: 'kitchen',
      }),
      ORDER_STATUS_SERVICE_ERROR_CODES.ACTOR_NOT_AUTHORIZED,
      403
    );
    await verifyStoredStatus(unauthorizedKitchen, 'new');

    const unauthorizedCustomer = await createOrder('CUSTOMER-ACCEPT');
    await expectServiceError(
      updateOrderStatus({
        orderId: unauthorizedCustomer,
        targetStatus: 'accepted',
        actor: 'customer',
      }),
      ORDER_STATUS_SERVICE_ERROR_CODES.ACTOR_NOT_AUTHORIZED,
      403
    );
    await verifyStoredStatus(unauthorizedCustomer, 'new');

    await expectServiceError(
      updateOrderStatus({
        orderId: `${orderPrefix}-MISSING`,
        targetStatus: 'accepted',
        actor: 'kitchen',
      }),
      ORDER_STATUS_SERVICE_ERROR_CODES.ORDER_NOT_FOUND,
      404
    );

    const rollbackOrder = await createOrder('ROLLBACK');
    const fakeClient = {
      released: false,
      rolledBack: false,
      async query(sql) {
        if (sql === 'BEGIN') return { rows: [] };
        if (sql.includes('SELECT') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 999,
              order_code: rollbackOrder,
              status: 'new',
              order_time: new Date(),
              updated_at: new Date(),
              table_number: tableNumber,
            }],
          };
        }
        if (sql.includes('UPDATE orders')) throw new Error('simulated update failure');
        if (sql === 'ROLLBACK') {
          this.rolledBack = true;
          return { rows: [] };
        }
        throw new Error(`Unexpected SQL in rollback test: ${sql}`);
      },
      release() {
        this.released = true;
      },
    };
    try {
      await updateOrderStatus(
        { orderId: rollbackOrder, targetStatus: 'accepted', actor: 'kitchen' },
        { pool: { connect: async () => fakeClient } }
      );
      assert.fail('Simulated update failure should reject.');
    } catch (error) {
      check(error.message === 'simulated update failure', 'Original update error should be preserved.');
      check(fakeClient.rolledBack, 'Update failure should roll back the transaction.');
      check(fakeClient.released, 'Update failure should release the client.');
    }
    await verifyStoredStatus(rollbackOrder, 'new');

    const concurrentAccept = await createOrder('CONCURRENT-ACCEPT');
    const acceptResults = await Promise.allSettled([
      updateOrderStatus({ orderId: concurrentAccept, targetStatus: 'accepted', actor: 'kitchen' }),
      updateOrderStatus({ orderId: concurrentAccept, targetStatus: 'accepted', actor: 'kitchen' }),
    ]);
    check(
      acceptResults.filter((result) => result.status === 'fulfilled').length === 1,
      'Only one concurrent accept should succeed.'
    );
    const rejectedAccept = acceptResults.find((result) => result.status === 'rejected');
    check(
      rejectedAccept?.reason?.code === ORDER_STATUS_SERVICE_ERROR_CODES.DUPLICATE_TRANSITION,
      'The second concurrent accept should observe the committed accepted state.'
    );
    await verifyStoredStatus(concurrentAccept, 'accepted');

    const acceptCancelRace = await createOrder('ACCEPT-CANCEL-RACE');
    const raceResults = await Promise.allSettled([
      updateOrderStatus({ orderId: acceptCancelRace, targetStatus: 'accepted', actor: 'kitchen' }),
      updateOrderStatus({ orderId: acceptCancelRace, targetStatus: 'cancelled', actor: 'customer' }),
    ]);
    check(
      raceResults.filter((result) => result.status === 'fulfilled').length === 1,
      'Exactly one accept-versus-cancel transition should succeed.'
    );
    const raceStored = await query('SELECT status FROM orders WHERE order_code = $1', [acceptCancelRace]);
    check(
      ['accepted', 'cancelled'].includes(raceStored.rows[0]?.status),
      'Race winner should leave one valid committed status.'
    );
    const raceFailure = raceResults.find((result) => result.status === 'rejected');
    check(raceFailure?.reason?.statusCode === 409, 'Race loser should receive a conflict error.');

    console.log(`FR-07 order status service tests passed (${assertions}/${assertions}).`);
  } finally {
    await cleanup();
    const remainingOrders = await query(
      'SELECT COUNT(*)::INTEGER AS count FROM orders WHERE order_code LIKE $1',
      [`${orderPrefix}%`]
    );
    const remainingTables = await query(
      'SELECT COUNT(*)::INTEGER AS count FROM restaurant_tables WHERE table_number = $1',
      [tableNumber]
    );
    assert.equal(remainingOrders.rows[0].count, 0, 'FR-07 test orders must be cleaned up.');
    assert.equal(remainingTables.rows[0].count, 0, 'FR-07 test table must be cleaned up.');
    console.log('FR-07 order status service cleanup verified (0 orders, 0 tables).');
    await closePool();
  }
}

run().catch((error) => {
  console.error('FR-07 order status service tests failed:', error);
  process.exitCode = 1;
});
