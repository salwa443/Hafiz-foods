import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  createKitchenOrderSession,
  mergeKitchenOrders,
} from '../utils/kitchenOrderState.js';

const firstOrder = {
  orderId: 'ORD-1',
  tableNumber: 'T01',
  orderTime: '2026-11-20T10:00:00.000Z',
  status: 'new',
  items: [{ name: 'Burger', quantity: 2, specialInstructions: 'No onions' }],
};
const secondOrder = {
  orderId: 'ORD-2',
  tableNumber: 'T02',
  orderTime: '2026-11-20T10:01:00.000Z',
  status: 'new',
  items: [{ name: 'Pizza', quantity: 1, specialInstructions: null }],
};

class FakeSocket {
  constructor() {
    this.handlers = new Map();
    this.connectCalls = 0;
    this.disconnectCalls = 0;
  }

  on(event, handler) {
    const handlers = this.handlers.get(event) || new Set();
    handlers.add(handler);
    this.handlers.set(event, handlers);
  }

  off(event, handler) {
    this.handlers.get(event)?.delete(handler);
  }

  connect() {
    this.connectCalls += 1;
  }

  disconnect() {
    this.disconnectCalls += 1;
  }

  emitTest(event, payload) {
    this.handlers.get(event)?.forEach((handler) => handler(payload));
  }

  listenerCount() {
    return [...this.handlers.values()].reduce((count, handlers) => count + handlers.size, 0);
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

assert.deepEqual(mergeKitchenOrders([secondOrder], [firstOrder]).map((order) => order.orderId), ['ORD-1', 'ORD-2']);
assert.equal(mergeKitchenOrders([firstOrder], [firstOrder]).length, 1);

const socket = new FakeSocket();
const states = [];
let activeOrders = [firstOrder];
let loadCalls = 0;
const session = createKitchenOrderSession({
  socket,
  loadOrders: async () => {
    loadCalls += 1;
    return activeOrders;
  },
  updateOrderStatus: async () => firstOrder,
  onStateChange: (state) => states.push(state),
});
session.start();
await flush();
assert.deepEqual(states.at(-1).orders.map((order) => order.orderId), ['ORD-1']);
assert.equal(states.at(-1).isLoading, false);
assert.equal(socket.connectCalls, 1);

activeOrders = [firstOrder, secondOrder];
socket.emitTest('connect');
await flush();
assert.deepEqual(states.at(-1).orders.map((order) => order.orderId), ['ORD-1', 'ORD-2']);
socket.emitTest('kitchen:order:new', secondOrder);
assert.deepEqual(states.at(-1).orders.map((order) => order.orderId), ['ORD-1', 'ORD-2']);
socket.emitTest('kitchen:order:new', secondOrder);
assert.equal(states.at(-1).orders.length, 2);

activeOrders = [secondOrder];
socket.emitTest('disconnect');
assert.equal(states.at(-1).connectionStatus, 'disconnected');
socket.emitTest('connect');
await flush();
assert.equal(loadCalls, 3);
assert.deepEqual(states.at(-1).orders.map((order) => order.orderId), ['ORD-2']);
assert.equal(states.at(-1).connectionStatus, 'connected');

socket.emitTest('connect_error');
assert.equal(states.at(-1).connectionStatus, 'error');

session.stop();
assert.equal(socket.disconnectCalls, 1);
assert.equal(socket.listenerCount(), 0);

const failureSocket = new FakeSocket();
const failureStates = [];
const failureSession = createKitchenOrderSession({
  socket: failureSocket,
  loadOrders: async () => { throw new Error('API unavailable'); },
  updateOrderStatus: async () => firstOrder,
  onStateChange: (state) => failureStates.push(state),
});
failureSession.start();
await flush();
assert.match(failureStates.at(-1).error, /could not load/i);
assert.equal(failureStates.at(-1).isLoading, false);
failureSession.stop();

let resolveBufferedLoad;
const bufferingSocket = new FakeSocket();
const bufferingStates = [];
const bufferingSession = createKitchenOrderSession({
  socket: bufferingSocket,
  loadOrders: () => new Promise((resolve) => { resolveBufferedLoad = resolve; }),
  updateOrderStatus: async () => firstOrder,
  onStateChange: (state) => bufferingStates.push(state),
});
bufferingSession.start();
bufferingSocket.emitTest('kitchen:order:new', secondOrder);
resolveBufferedLoad([firstOrder]);
await flush();
assert.deepEqual(
  bufferingStates.at(-1).orders.map((order) => order.orderId),
  ['ORD-1', 'ORD-2']
);
bufferingSession.stop();

const routeSource = await fs.readFile(new URL('../routes/AppRoutes.jsx', import.meta.url), 'utf8');
assert.match(routeSource, /allowedRoles=\{\['kitchen'\]\}/);
assert.match(routeSource, /path="\/kitchen"/);
const dashboardSource = await fs.readFile(new URL('../pages/kitchen/KitchenDashboard.jsx', import.meta.url), 'utf8');
assert.match(dashboardSource, /onChangeStatus/);

console.log('FR-06 kitchen frontend state tests passed (20/20).');
