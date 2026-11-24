import http from 'node:http';
import app from '../app.js';
import { closePool, query } from '../config/db.js';
import { getReadyOrders, updateDelivery } from '../services/waiterOrderService.js';
import { publishWaiterReadyOrder } from '../services/waiterOrderRealtimeService.js';
import { SOCKET_EVENTS, WAITER_SOCKET_ROOM } from '../realtime/socketServer.js';
import { generateToken } from '../services/authService.js';

const suffix = Date.now();
const results = [];
const emails = ['one', 'two'].map((name) => `waiter.ready.${name}.${suffix}@example.com`);
const roleEmails = [`waiter.ready.kitchen.${suffix}@example.com`, `waiter.ready.admin.${suffix}@example.com`];
let tableId;
let orderId;

function record(test, passed) { results.push({ test, status: passed ? 'PASS' : 'FAIL' }); if (!passed) throw new Error(test); }

async function cleanup() {
  if (orderId) await query('DELETE FROM orders WHERE id=$1', [orderId]);
  if (tableId) await query('DELETE FROM restaurant_tables WHERE id=$1', [tableId]);
  await query('DELETE FROM users WHERE email=ANY($1::text[])', [[...emails, ...roleEmails]]);
}

try {
  await cleanup();
  const users = [];
  for (let index = 0; index < 2; index += 1) {
    const result = await query(`INSERT INTO users(role_id,name,email,password_hash,is_active) VALUES((SELECT id FROM roles WHERE name='waiter'),$1,$2,'test',TRUE) RETURNING id,name`, [`Ready Waiter ${index + 1}`, emails[index]]);
    users.push({ ...result.rows[0], role: 'waiter' });
  }
  const roleUsers = {};
  for (const [index, role] of ['kitchen', 'admin'].entries()) {
    const result = await query(`INSERT INTO users(role_id,name,email,password_hash,is_active) VALUES((SELECT id FROM roles WHERE name=$1),$2,$3,'test',TRUE) RETURNING id,name,email,is_active`, [role, `Ready ${role}`, roleEmails[index]]);
    roleUsers[role] = { ...result.rows[0], role };
  }
  const table = await query(`INSERT INTO restaurant_tables(table_number,qr_token,qr_code_data,status,is_active) VALUES($1,$2,$3,'occupied',TRUE) RETURNING id`, [`WR${suffix}`, `wr-token-${suffix}`, `/menu/WR${suffix}/token`]);
  tableId = table.rows[0].id;
  const order = await query(`INSERT INTO orders(order_code,table_id,status,payment_method,total_amount) VALUES($1,$2,'ready','cash',100) RETURNING id`, [`WR-${suffix}`, tableId]);
  orderId = order.rows[0].id;
  await query(`INSERT INTO order_items(order_id,menu_item_id,item_name_snapshot,unit_price_snapshot,quantity,special_instructions,subtotal) VALUES($1,1,'Classic Beef Burger',100,2,'No onions',200)`, [orderId]);

  const initial = await getReadyOrders();
  const testOrder = initial.find((item) => item.orderId === `WR-${suffix}`);
  record('ready order appears with item snapshots', testOrder?.items[0].quantity === 2 && testOrder.items[0].specialInstructions === 'No onions');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = (token) => fetch(`${baseUrl}/api/waiter/orders/ready`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  record('unauthenticated ready queue request is rejected', (await request()).status === 401);
  record('kitchen role cannot access waiter ready queue', (await request(generateToken(roleUsers.kitchen))).status === 403);
  record('waiter role can access waiter ready queue', (await request(generateToken(users[0]))).status === 200);
  record('admin role can inspect waiter ready queue', (await request(generateToken(roleUsers.admin))).status === 200);
  await new Promise((resolve) => server.close(resolve));

  const claims = await Promise.allSettled(users.map((actor) => updateDelivery({ orderId: `WR-${suffix}`, action: 'claim', actor })));
  record('two-waiter claim race has exactly one winner', claims.filter((item) => item.status === 'fulfilled').length === 1);
  const winner = users[claims.findIndex((item) => item.status === 'fulfilled')];
  const loser = users.find((user) => user.id !== winner.id);
  const claimed = claims.find((item) => item.status === 'fulfilled').value;
  record('claim records assigned waiter and claimed time', claimed.assignedWaiter.id === winner.id && Boolean(claimed.claimedAt));

  const unauthorized = await updateDelivery({ orderId: `WR-${suffix}`, action: 'pickup', actor: loser }).then(() => false).catch((error) => error.statusCode === 403);
  record('unassigned waiter cannot pick up order', unauthorized);
  const pickedUp = await updateDelivery({ orderId: `WR-${suffix}`, action: 'pickup', actor: winner });
  record('assigned waiter can mark picked up', pickedUp.deliveryStatus === 'picked_up' && Boolean(pickedUp.pickedUpAt));
  const delivered = await updateDelivery({ orderId: `WR-${suffix}`, action: 'deliver', actor: winner });
  record('assigned waiter can mark delivered', delivered.deliveryStatus === 'delivered' && Boolean(delivered.deliveredAt));
  record('delivered order leaves ready queue', !(await getReadyOrders()).some((item) => item.orderId === `WR-${suffix}`));

  const calls = [];
  const mockSocket = { to: (room) => ({ emit: (event, payload) => calls.push({ room, event, payload }) }) };
  publishWaiterReadyOrder(claimed, mockSocket);
  record('ready event targets waiter room', calls.length === 1 && calls[0].room === WAITER_SOCKET_ROOM && calls[0].event === SOCKET_EVENTS.WAITER_ORDER_READY);
  record('waiter event excludes credentials', !JSON.stringify(calls).includes('token') && !JSON.stringify(calls).includes('password'));

  console.table(results);
  console.log(`Waiter ready-order tests passed: ${results.length}/${results.length}`);
} catch (error) {
  console.table(results); console.error('Waiter ready-order tests failed:', error.message); process.exitCode = 1;
} finally { await cleanup(); await closePool(); }
