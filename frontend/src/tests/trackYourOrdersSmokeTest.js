import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  addOrderTrackingReference,
  listOrderTrackingReferences,
} from '../services/customerOrderTrackingStorage.js';

function createStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
  };
}

const tokenA = 'A'.repeat(43);
const tokenB = 'B'.repeat(43);
const tokenC = 'C'.repeat(43);
const storage = createStorage();

assert.deepEqual(listOrderTrackingReferences(41, storage), []);
assert.equal(addOrderTrackingReference(41, {
  orderId: 'ORD-TABLE-41-A', trackingToken: tokenA, orderTime: '2026-11-23T10:00:00.000Z',
}, storage), true);
assert.equal(addOrderTrackingReference(41, {
  orderId: 'ORD-TABLE-41-B', trackingToken: tokenB, orderTime: '2026-11-23T10:05:00.000Z',
}, storage), true);
assert.equal(addOrderTrackingReference(42, {
  orderId: 'ORD-TABLE-42', trackingToken: tokenC, orderTime: '2026-11-23T10:10:00.000Z',
}, storage), true);

assert.deepEqual(
  listOrderTrackingReferences(41, storage).map(({ orderId }) => orderId),
  ['ORD-TABLE-41-A', 'ORD-TABLE-41-B']
);
assert.deepEqual(
  listOrderTrackingReferences(42, storage).map(({ orderId }) => orderId),
  ['ORD-TABLE-42']
);

storage.setItem('customerOrderTracking:43', '{malformed');
assert.deepEqual(listOrderTrackingReferences(43, storage), []);
const unavailableStorage = { getItem() { throw new Error('Unavailable'); } };
assert.deepEqual(listOrderTrackingReferences(41, unavailableStorage), []);

const componentSource = await readFile(
  new URL('../components/customer/TrackYourOrders.jsx', import.meta.url),
  'utf8'
);
const menuSource = await readFile(
  new URL('../pages/customer/CustomerMenuExperience.jsx', import.meta.url),
  'utf8'
);

assert.match(menuSource, /<TrackYourOrders tableId=\{table\.id\}/);
assert.match(componentSource, /Track Your Orders/);
assert.match(componentSource, /listOrderTrackingReferences\(tableId\)/);
assert.match(componentSource, /orders\.map/);
assert.match(componentSource, /order\.orderId/);
assert.match(componentSource, /order\.orderTime/);
assert.match(componentSource, /to=\{`\/track\/\$\{encodeURIComponent\(order\.orderId\)\}`\}/);
assert.match(componentSource, /no saved orders for this table/i);
assert.doesNotMatch(componentSource, /trackingToken/);
assert.doesNotMatch(componentSource, /qrToken/);
assert.doesNotMatch(componentSource, /console\./);

console.log('FR-08 Track Your Orders entry-point tests passed (18/18).');
