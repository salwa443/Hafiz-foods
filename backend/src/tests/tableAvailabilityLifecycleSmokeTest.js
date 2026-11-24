import { closePool, query } from '../config/db.js';
import {
  deactivateTable,
  findTableById,
  reactivateTable,
  updateTableStatus,
} from '../models/tableModel.js';
import { placeOrder } from '../services/orderService.js';
import { updateOrderStatus } from '../services/orderStatusService.js';

const suffix = Date.now();
const tableNumber = `LIFE${String(suffix).slice(-8)}`;
const qrToken = `lifecycle-token-${suffix}`;
const qrCodeData = `/menu/${tableNumber}/${qrToken}`;
const results = [];
let tableId;

function record(name, passed, detail = '') {
  results.push({ test: name, status: passed ? 'PASS' : 'FAIL', detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

async function tableStatus() {
  return (await findTableById(tableId))?.status;
}

async function completeOrder(orderId) {
  for (const targetStatus of ['accepted', 'preparing', 'ready', 'completed']) {
    await updateOrderStatus({ orderId, targetStatus, actor: 'kitchen' });
  }
}

async function cleanup() {
  if (!tableId) return;
  await query('DELETE FROM orders WHERE table_id = $1', [tableId]);
  await query('DELETE FROM restaurant_tables WHERE id = $1', [tableId]);
}

try {
  const tableResult = await query(
    `INSERT INTO restaurant_tables (table_number, qr_token, qr_code_data, status, is_active)
     VALUES ($1, $2, $3, 'available', TRUE)
     RETURNING id`,
    [tableNumber, qrToken, qrCodeData]
  );
  tableId = tableResult.rows[0].id;

  const firstOrder = await placeOrder({
    tableNumber,
    qrToken,
    paymentMethod: 'cash',
    items: [{ menuItemId: 1, quantity: 1, specialInstructions: '' }],
  });
  record('order placement marks table occupied', (await tableStatus()) === 'occupied');
  record(
    'active order prevents manual available status',
    (await updateTableStatus(tableId, 'available')) === null
  );
  record(
    'active order prevents table deactivation',
    (await deactivateTable(tableId)) === null
  );

  await completeOrder(firstOrder.orderId);
  record('completed final active order releases table', (await tableStatus()) === 'available');

  const secondOrder = await placeOrder({
    tableNumber,
    qrToken,
    paymentMethod: 'pay_at_counter',
    items: [{ menuItemId: 1, quantity: 1, specialInstructions: 'Lifecycle test' }],
  });
  await updateOrderStatus({
    orderId: secondOrder.orderId,
    targetStatus: 'cancelled',
    actor: 'customer',
    expectedTableNumber: tableNumber,
    trackingToken: secondOrder.trackingToken,
  });
  record('cancelled final active order releases table', (await tableStatus()) === 'available');

  const thirdOrder = await placeOrder({
    tableNumber,
    qrToken,
    paymentMethod: 'pay_at_table',
    items: [{ menuItemId: 1, quantity: 1, specialInstructions: '' }],
  });
  const fourthOrder = await placeOrder({
    tableNumber,
    qrToken,
    paymentMethod: 'cash',
    items: [{ menuItemId: 1, quantity: 1, specialInstructions: '' }],
  });
  await completeOrder(thirdOrder.orderId);
  record('table stays occupied while another active order remains', (await tableStatus()) === 'occupied');
  await completeOrder(fourthOrder.orderId);
  record('table becomes available after all active orders finish', (await tableStatus()) === 'available');

  const beforeDeactivation = await findTableById(tableId);
  const deactivated = await deactivateTable(tableId);
  const reactivated = await reactivateTable(tableId);
  record('table deactivation remains soft', !deactivated.is_active && deactivated.status === 'inactive');
  record('table can be explicitly reactivated', reactivated.is_active && reactivated.status === 'available');
  record('reactivation preserves table id', reactivated.id === beforeDeactivation.id);
  record('reactivation preserves QR token', reactivated.qr_token === beforeDeactivation.qr_token);
  record('reactivation preserves QR URL', reactivated.qr_code_data === beforeDeactivation.qr_code_data);

  console.table(results);
  console.log(`Table availability lifecycle tests passed: ${results.length}/${results.length}`);
} catch (error) {
  console.table(results);
  console.error('Table availability lifecycle tests failed:', error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
  await closePool();
}
