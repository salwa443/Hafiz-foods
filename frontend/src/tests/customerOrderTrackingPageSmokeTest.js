import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getCustomerTrackedOrder } from '../services/customerOrderService.js';
import {
  addOrderTrackingReference,
  findOrderTrackingReference,
} from '../services/customerOrderTrackingStorage.js';

function createEnumerableStorage() {
  const values = new Map();

  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

const storage = createEnumerableStorage();
const firstReference = {
  orderId: 'ORD-PAGE-1',
  trackingToken: 'a'.repeat(43),
  orderTime: '2026-11-23T12:00:00.000Z',
};
const secondReference = {
  orderId: 'ORD-PAGE-2',
  trackingToken: 'b'.repeat(43),
  orderTime: '2026-11-23T12:05:00.000Z',
};

assert.equal(addOrderTrackingReference(10, firstReference, storage), true);
assert.equal(addOrderTrackingReference(10, secondReference, storage), true);
assert.deepEqual(findOrderTrackingReference(firstReference.orderId, storage), {
  tableId: 10,
  ...firstReference,
});
assert.deepEqual(findOrderTrackingReference(secondReference.orderId, storage), {
  tableId: 10,
  ...secondReference,
});
assert.equal(findOrderTrackingReference('ORD-MISSING', storage), null);

const otherTableReference = {
  orderId: 'ORD-OTHER-TABLE',
  trackingToken: 'c'.repeat(43),
  orderTime: '2026-11-23T12:10:00.000Z',
};
assert.equal(addOrderTrackingReference(11, otherTableReference, storage), true);
assert.equal(findOrderTrackingReference(otherTableReference.orderId, storage)?.tableId, 11);

storage.setItem('customerOrderTracking:bad', '{malformed');
assert.equal(findOrderTrackingReference('ORD-NOT-THERE', storage), null);

let capturedRequest;
const trackedOrder = {
  orderId: firstReference.orderId,
  tableNumber: 'T01',
  status: 'preparing',
  paymentMethod: 'cash',
  totalAmount: '20.00',
  orderTime: firstReference.orderTime,
  updatedAt: firstReference.orderTime,
  items: [],
};
const fakeClient = {
  async get(url, config) {
    capturedRequest = { url, config };
    return { data: { data: { order: trackedOrder } } };
  },
};
const result = await getCustomerTrackedOrder(
  firstReference.orderId,
  firstReference.trackingToken,
  {},
  fakeClient
);
assert.deepEqual(result, trackedOrder);
assert.equal(capturedRequest.url, '/public/orders/ORD-PAGE-1/tracking');
assert.equal(
  capturedRequest.config.headers['X-Order-Tracking-Token'],
  firstReference.trackingToken
);
assert.equal(capturedRequest.url.includes(firstReference.trackingToken), false);
assert.equal('params' in capturedRequest.config, false);

const rejectingClient = {
  async get() {
    const error = new Error('not found');
    error.response = { status: 404, data: { code: 'ORDER_NOT_FOUND' } };
    throw error;
  },
};
await assert.rejects(() => getCustomerTrackedOrder(
  firstReference.orderId,
  firstReference.trackingToken,
  {},
  rejectingClient
));

const routeSource = await readFile(new URL('../routes/AppRoutes.jsx', import.meta.url), 'utf8');
const pageSource = await readFile(
  new URL('../pages/customer/OrderTrackingPage.jsx', import.meta.url),
  'utf8'
);
assert.match(routeSource, /path="\/track\/:orderId"/);
assert.match(pageSource, /findOrderTrackingReference\(orderId\)/);
assert.match(pageSource, /getCustomerTrackedOrder\(/);
assert.match(pageSource, /navigate\(-1\)/);
assert.match(pageSource, /navigate\('\/'\)/);
assert.match(pageSource, /allowCancellation/);
assert.match(pageSource, /useMemo/);
assert.match(pageSource, /initialOrder: trackedInitialOrder/);
assert.doesNotMatch(routeSource, /trackingToken/);
assert.doesNotMatch(pageSource, /console\.(log|error|warn)/);

console.log('FR-08 customer order tracking page tests passed (22/22).');
