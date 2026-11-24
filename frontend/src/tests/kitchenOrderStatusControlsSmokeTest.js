import assert from 'node:assert/strict';
import { getKitchenOrderAction } from '../utils/kitchenOrderActions.js';
import { updateKitchenOrderStatus } from '../services/kitchenOrderService.js';
import {
  applyKitchenOrderStatusUpdate,
  createKitchenOrderSession,
} from '../utils/kitchenOrderState.js';

const order = (orderId, status, orderTime) => ({
  orderId,
  tableNumber: 'T01',
  orderTime,
  updatedAt: orderTime,
  status,
  items: [{ name: 'Burger', quantity: 1, specialInstructions: null }],
});
const first = order('ORD-1', 'new', '2026-11-20T10:00:00.000Z');
const second = order('ORD-2', 'accepted', '2026-11-20T10:01:00.000Z');

assert.deepEqual(getKitchenOrderAction('new'), { label: 'Accept Order', targetStatus: 'accepted' });
assert.deepEqual(getKitchenOrderAction('accepted'), { label: 'Start Preparing', targetStatus: 'preparing' });
assert.deepEqual(getKitchenOrderAction('preparing'), { label: 'Mark Ready', targetStatus: 'ready' });
assert.deepEqual(getKitchenOrderAction('ready'), { label: 'Mark Completed', targetStatus: 'completed' });
assert.equal(getKitchenOrderAction('completed'), null);
assert.equal(getKitchenOrderAction('cancelled'), null);

let capturedRequest;
const fakeClient = {
  async patch(url, body) {
    capturedRequest = { url, body };
    return { data: { data: { order: { ...first, status: body.status } } } };
  },
};
await updateKitchenOrderStatus('ORD/1', 'accepted', fakeClient);
assert.deepEqual(capturedRequest, {
  url: '/kitchen/orders/ORD%2F1/status',
  body: { status: 'accepted' },
});

assert.equal(applyKitchenOrderStatusUpdate([first], { ...first, status: 'completed' }).length, 0);
assert.equal(applyKitchenOrderStatusUpdate([first], { ...first, status: 'cancelled' }).length, 0);
assert.equal(applyKitchenOrderStatusUpdate([first], { ...first, status: 'accepted' })[0].status, 'accepted');

class FakeSocket {
  constructor() {
    this.handlers = new Map();
    this.disconnectCalls = 0;
  }
  on(event, handler) {
    const handlers = this.handlers.get(event) || new Set();
    handlers.add(handler);
    this.handlers.set(event, handlers);
  }
  off(event, handler) { this.handlers.get(event)?.delete(handler); }
  connect() {}
  disconnect() { this.disconnectCalls += 1; }
  emitTest(event, payload) { this.handlers.get(event)?.forEach((handler) => handler(payload)); }
  listenerCount(event) { return this.handlers.get(event)?.size || 0; }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const socket = new FakeSocket();
const states = [];
let resolveUpdate;
let updateCalls = 0;
let activeOrders = [first, second];
let loadCalls = 0;
const session = createKitchenOrderSession({
  socket,
  loadOrders: async () => {
    loadCalls += 1;
    return activeOrders;
  },
  updateOrderStatus: async (orderId, targetStatus) => {
    updateCalls += 1;
    return new Promise((resolve) => {
      resolveUpdate = () => resolve({ ...first, orderId, status: targetStatus });
    });
  },
  onStateChange: (state) => states.push(state),
});
session.start();
await flush();

const firstSubmission = session.changeStatus('ORD-1', 'accepted');
const duplicateSubmission = await session.changeStatus('ORD-1', 'accepted');
assert.equal(duplicateSubmission, false);
assert.equal(updateCalls, 1);
assert.deepEqual(states.at(-1).pendingOrderIds, ['ORD-1']);
resolveUpdate();
assert.equal(await firstSubmission, true);
assert.equal(states.at(-1).orders.find((item) => item.orderId === 'ORD-1').status, 'accepted');
assert.deepEqual(states.at(-1).pendingOrderIds, []);

socket.emitTest('kitchen:order:status-updated', { ...second, status: 'preparing', updatedAt: '2026-11-20T10:02:00.000Z' });
assert.equal(states.at(-1).orders.find((item) => item.orderId === 'ORD-2').status, 'preparing');
socket.emitTest('kitchen:order:status-updated', { ...second, status: 'preparing' });
assert.equal(states.at(-1).orders.length, 2);
socket.emitTest('kitchen:order:status-updated', { ...second, status: 'completed' });
assert.equal(states.at(-1).orders.some((item) => item.orderId === 'ORD-2'), false);

const third = order('ORD-3', 'new', '2026-11-20T09:59:00.000Z');
socket.emitTest('kitchen:order:new', third);
assert.deepEqual(states.at(-1).orders.map((item) => item.orderId), ['ORD-3', 'ORD-1']);

activeOrders = [order('ORD-4', 'ready', '2026-11-20T09:58:00.000Z')];
socket.emitTest('connect');
socket.emitTest('disconnect');
socket.emitTest('connect');
await flush();
assert.equal(loadCalls, 2);
assert.deepEqual(states.at(-1).orders.map((item) => item.orderId), ['ORD-4']);

session.stop();
assert.equal(socket.listenerCount('kitchen:order:new'), 0);
assert.equal(socket.listenerCount('kitchen:order:status-updated'), 0);
assert.equal(socket.disconnectCalls, 1);

const failureSocket = new FakeSocket();
const failureStates = [];
let failureLoadCalls = 0;
const failureSession = createKitchenOrderSession({
  socket: failureSocket,
  loadOrders: async () => {
    failureLoadCalls += 1;
    return [first];
  },
  updateOrderStatus: async () => {
    const error = new Error('conflict');
    error.response = { status: 409, data: { message: 'Conflict' } };
    throw error;
  },
  onStateChange: (state) => failureStates.push(state),
});
failureSession.start();
await flush();
assert.equal(await failureSession.changeStatus('ORD-1', 'accepted'), false);
assert.equal(failureStates.at(-1).orders[0].status, 'new');
assert.match(failureStates.at(-1).actionErrors['ORD-1'], /another kitchen session/i);
assert.equal(failureLoadCalls, 2);
failureSession.stop();

console.log('FR-07 kitchen status controls tests passed (29/29).');
