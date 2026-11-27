import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { createWaiterQueueSync, getWaiterOrderAction, mergeWaiterOrder } from '../utils/waiterOrderState.js';

const earlier = { orderId: 'ORD-1', readyAt: '2026-01-01T10:00:00Z', deliveryStatus: 'ready', assignedWaiter: null };
const later = { orderId: 'ORD-2', readyAt: '2026-01-01T11:00:00Z', deliveryStatus: 'ready', assignedWaiter: null };
let orders = mergeWaiterOrder([], later);
orders = mergeWaiterOrder(orders, earlier);
assert.deepEqual(orders.map((order) => order.orderId), ['ORD-1', 'ORD-2']);

orders = mergeWaiterOrder(orders, { ...earlier, assignedWaiter: { id: 7, name: 'Waiter One' }, deliveryStatus: 'claimed' });
assert.equal(orders.length, 2, 'realtime updates must replace, not duplicate, an order');
assert.equal(getWaiterOrderAction(later, 7), 'claim');
assert.equal(getWaiterOrderAction(orders[0], 7), 'pickup');
assert.equal(getWaiterOrderAction(orders[0], 8), null);

orders = mergeWaiterOrder(orders, { ...orders[0], pickedUpAt: '2026-01-01T10:05:00Z', deliveryStatus: 'picked_up' });
assert.equal(getWaiterOrderAction(orders[0], 7), 'deliver');

orders = mergeWaiterOrder(orders, { ...orders[0], deliveredAt: '2026-01-01T10:10:00Z', deliveryStatus: 'delivered' });
assert.deepEqual(orders.map((order) => order.orderId), ['ORD-2']);

const hookSource = await readFile(new URL('../hooks/useWaiterOrders.js', import.meta.url), 'utf8');
const initialLoadPosition = hookSource.indexOf('setTimeout(queue.refresh');
const socketConnectPosition = hookSource.indexOf('socket.connect();');
assert.ok(initialLoadPosition >= 0 && initialLoadPosition < socketConnectPosition, 'REST loading must not wait for Socket.IO connection');
let visible = [];
const requests = [];
const queue = createWaiterQueueSync({
  loadOrders: () => new Promise((resolve) => requests.push(resolve)),
  onSnapshot: (snapshot) => { visible = snapshot; },
  onUpdate: (order) => { visible = mergeWaiterOrder(visible, order); },
  onLoading: () => {},
  onError: () => {},
});

const firstLoad = queue.refresh();
assert.equal(queue.refresh(), firstLoad);
queue.refresh({ afterConnection: true });
await Promise.resolve();
queue.receive(later);
requests[0]([earlier]);
await setImmediate();
assert.deepEqual(visible, [earlier, later]);
assert.equal(requests.length, 2);
queue.receive({ ...earlier, deliveryStatus: 'delivered' });
requests[1]([earlier, later]);
await firstLoad;
assert.deepEqual(visible, [later]);
queue.stop();
queue.receive(earlier);
assert.deepEqual(visible, [later]);

console.log('Waiter frontend state and connection-race tests passed.');
