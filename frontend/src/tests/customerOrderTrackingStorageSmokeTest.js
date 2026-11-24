import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { submitOrderOnce } from '../utils/orderSubmission.js';
import {
  addOrderTrackingReference,
  getOrderTrackingReference,
  getOrderTrackingStorageKey,
  listOrderTrackingReferences,
  removeOrderTrackingReference,
} from '../services/customerOrderTrackingStorage.js';

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

const firstToken = 'a'.repeat(43);
const secondToken = 'b'.repeat(43);
const otherTableToken = 'c'.repeat(43);
const firstOrder = {
  orderId: 'ORD-TRACK-1',
  trackingToken: firstToken,
  orderTime: '2026-11-23T12:00:00.000Z',
};
const secondOrder = {
  orderId: 'ORD-TRACK-2',
  trackingToken: secondToken,
  orderTime: '2026-11-23T12:05:00.000Z',
};
const storage = createMemoryStorage();

assert.equal(addOrderTrackingReference(1, firstOrder, storage), true);
assert.deepEqual(getOrderTrackingReference(1, firstOrder.orderId, storage), firstOrder);
assert.equal(listOrderTrackingReferences(1, storage).length, 1);

assert.equal(addOrderTrackingReference(1, secondOrder, storage), true);
assert.deepEqual(
  listOrderTrackingReferences(1, storage).map((order) => order.orderId),
  [firstOrder.orderId, secondOrder.orderId]
);

assert.equal(addOrderTrackingReference(2, {
  orderId: 'ORD-OTHER-TABLE',
  trackingToken: otherTableToken,
  orderTime: '2026-11-23T12:10:00.000Z',
}, storage), true);
assert.equal(listOrderTrackingReferences(1, storage).length, 2);
assert.equal(listOrderTrackingReferences(2, storage).length, 1);
assert.equal(getOrderTrackingReference(1, 'ORD-OTHER-TABLE', storage), null);

const rawStoredValue = storage.getItem(getOrderTrackingStorageKey(1));
assert.ok(rawStoredValue);
assert.equal(rawStoredValue.includes('qrToken'), false);
assert.equal(rawStoredValue.includes('memory-only-qr-token'), false);
assert.deepEqual(Object.keys(JSON.parse(rawStoredValue).orders[0]).sort(), [
  'orderId',
  'orderTime',
  'trackingToken',
]);

assert.equal(removeOrderTrackingReference(1, firstOrder.orderId, storage), true);
assert.equal(getOrderTrackingReference(1, firstOrder.orderId, storage), null);
assert.equal(getOrderTrackingReference(1, secondOrder.orderId, storage)?.orderId, secondOrder.orderId);
assert.equal(removeOrderTrackingReference(1, 'ORD-MISSING', storage), false);

storage.setItem(getOrderTrackingStorageKey(3), '{malformed json');
assert.deepEqual(listOrderTrackingReferences(3, storage), []);
storage.setItem(getOrderTrackingStorageKey(3), JSON.stringify({
  version: 1,
  tableId: 3,
  orders: [{ orderId: '', trackingToken: 'bad' }, firstOrder],
}));
assert.deepEqual(listOrderTrackingReferences(3, storage), [firstOrder]);

const unavailableStorage = {
  getItem() { throw new Error('storage unavailable'); },
  setItem() { throw new Error('storage unavailable'); },
  removeItem() { throw new Error('storage unavailable'); },
};
assert.deepEqual(listOrderTrackingReferences(1, unavailableStorage), []);
assert.equal(getOrderTrackingReference(1, firstOrder.orderId, unavailableStorage), null);
assert.equal(addOrderTrackingReference(1, firstOrder, unavailableStorage), false);
assert.equal(removeOrderTrackingReference(1, firstOrder.orderId, unavailableStorage), false);
assert.equal(addOrderTrackingReference(1, { orderId: 'BAD', trackingToken: 'short' }, storage), false);

const successStorage = createMemoryStorage();
const successful = await submitOrderOnce({
  submissionLock: { current: false },
  request: async () => firstOrder,
  onPending: () => {},
  onSuccess: (order) => addOrderTrackingReference(5, order, successStorage),
  onError: () => {},
});
assert.equal(successful, true);
assert.equal(listOrderTrackingReferences(5, successStorage).length, 1);

const failedStorage = createMemoryStorage();
const failed = await submitOrderOnce({
  submissionLock: { current: false },
  request: async () => { throw new Error('failed order'); },
  onPending: () => {},
  onSuccess: (order) => addOrderTrackingReference(5, order, failedStorage),
  onError: () => {},
});
assert.equal(failed, false);
assert.deepEqual(listOrderTrackingReferences(5, failedStorage), []);

const dialogSource = await readFile(
  new URL('../components/customer/OrderReviewDialog.jsx', import.meta.url),
  'utf8'
);
assert.match(dialogSource, /onSuccess:\s*\(order\)\s*=>\s*{\s*addOrderTrackingReference\(tableId, order\)/);
assert.doesNotMatch(dialogSource, /addOrderTrackingReference\([^)]*qrToken/);

console.log('FR-08 customer order tracking storage tests passed (30/30).');
