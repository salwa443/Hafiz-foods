import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { cancelCustomerOrder } from '../services/customerOrderService.js';
import {
  CUSTOMER_ORDER_STATUS_EVENT,
  createCustomerOrderSocket,
} from '../services/customerOrderSocketService.js';
import {
  applyCustomerOrderStatusEvent,
  canCancelCustomerOrder,
  createCustomerOrderStatusSession,
} from '../utils/customerOrderStatusState.js';

globalThis.sessionStorage = { getItem: () => null };

const initialOrder = {
  orderId: 'ORD-CUSTOMER-1',
  tableNumber: 'T01',
  orderTime: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  status: 'new',
  paymentMethod: 'cash',
  totalAmount: '10.00',
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
  off(event, handler) { this.handlers.get(event)?.delete(handler); }
  connect() { this.connectCalls += 1; }
  disconnect() { this.disconnectCalls += 1; }
  emitTest(event, payload) { this.handlers.get(event)?.forEach((handler) => handler(payload)); }
  listenerCount() {
    return [...this.handlers.values()].reduce((total, handlers) => total + handlers.size, 0);
  }
}

const viteServer = await createServer({ server: { middlewareMode: true }, appType: 'custom' });

try {
  const { default: CustomerOrderStatus } = await viteServer.ssrLoadModule(
    '/src/components/customer/CustomerOrderStatus.jsx'
  );
  const initialMarkup = renderToStaticMarkup(
    createElement(CustomerOrderStatus, {
      order: initialOrder,
      connectionStatus: 'connected',
      isCancelling: false,
      cancellationError: '',
      onCancel: () => {},
    })
  );
  assert.match(initialMarkup, /T01-OMER1/);
  assert.doesNotMatch(initialMarkup, /ORD-CUSTOMER-1/);
  assert.match(initialMarkup, /Table/);
  assert.match(initialMarkup, /New/);
  assert.match(initialMarkup, /Cancel order/);

  const completedMarkup = renderToStaticMarkup(
    createElement(CustomerOrderStatus, {
      order: { ...initialOrder, status: 'completed' },
      connectionStatus: 'disconnected',
      isCancelling: false,
      cancellationError: '',
      onCancel: () => {},
    })
  );
  assert.doesNotMatch(completedMarkup, /Cancel order/);
  assert.match(completedMarkup, /last confirmed status/i);

  const cancelledMarkup = renderToStaticMarkup(
    createElement(CustomerOrderStatus, {
      order: { ...initialOrder, status: 'cancelled' },
      connectionStatus: 'connected',
      isCancelling: false,
      cancellationError: '',
      onCancel: () => {},
    })
  );
  assert.match(cancelledMarkup, /has been cancelled/i);
  assert.doesNotMatch(cancelledMarkup, /Cancel order/);

  const readOnlyMarkup = renderToStaticMarkup(
    createElement(CustomerOrderStatus, {
      order: initialOrder,
      connectionStatus: 'connected',
      isCancelling: false,
      cancellationError: '',
      onCancel: () => {},
      allowCancellation: false,
    })
  );
  assert.doesNotMatch(readOnlyMarkup, /Cancel order/);

  const realSocket = createCustomerOrderSocket({
    tableNumber: 'T01',
    orderId: 'ORD-CUSTOMER-1',
    token: 'memory-only-qr-token',
  });
  assert.equal(realSocket.nsp, '/customer');
  assert.deepEqual(realSocket.auth, {
    tableNumber: 'T01',
    orderId: 'ORD-CUSTOMER-1',
    token: 'memory-only-qr-token',
  });
  assert.doesNotMatch(realSocket.io.uri, /memory-only-qr-token/);
  assert.equal(realSocket.io.opts.query, undefined);
  realSocket.disconnect();

  const trackedSocket = createCustomerOrderSocket({
    tableNumber: 'T01',
    orderId: 'ORD-TRACKED-1',
    token: 'qr-token-must-not-be-used',
    trackingToken: 'memory-only-order-tracking-token',
  });
  assert.deepEqual(trackedSocket.auth, {
    orderId: 'ORD-TRACKED-1',
    trackingToken: 'memory-only-order-tracking-token',
  });
  assert.equal('token' in trackedSocket.auth, false);
  assert.equal('tableNumber' in trackedSocket.auth, false);
  assert.doesNotMatch(trackedSocket.io.uri, /memory-only-order-tracking-token/);
  assert.equal(trackedSocket.io.opts.query, undefined);
  trackedSocket.disconnect();

  let capturedCancellation;
  const fakeClient = {
    async patch(url, data, config) {
      capturedCancellation = { url, data, config };
      return { data: { data: { order: { ...initialOrder, status: 'cancelled' } } } };
    },
  };
  const cancelledServiceOrder = await cancelCustomerOrder(
    'T01',
    'ORD/CUSTOMER',
    { trackingToken: 'memory-only-order-tracking-token' },
    {},
    fakeClient
  );
  assert.equal(cancelledServiceOrder.status, 'cancelled');
  assert.equal(capturedCancellation.url, '/public/tables/T01/orders/ORD%2FCUSTOMER/cancel');
  assert.equal(capturedCancellation.data, undefined);
  assert.equal(capturedCancellation.config.params, undefined);
  assert.deepEqual(capturedCancellation.config.headers, {
    'X-Order-Tracking-Token': 'memory-only-order-tracking-token',
  });

  await cancelCustomerOrder(
    'T01',
    'ORD-LEGACY',
    { qrToken: 'memory-only-qr-token' },
    {},
    fakeClient
  );
  assert.deepEqual(capturedCancellation.config.params, { token: 'memory-only-qr-token' });
  assert.equal(capturedCancellation.config.headers, undefined);

  assert.equal(
    applyCustomerOrderStatusEvent(initialOrder, {
      orderId: 'OTHER', status: 'accepted', updatedAt: '2026-11-20T10:01:00.000Z',
    }),
    initialOrder
  );
  const preparingOrder = applyCustomerOrderStatusEvent(initialOrder, {
    orderId: initialOrder.orderId,
    status: 'preparing',
    updatedAt: '2026-11-20T10:02:00.000Z',
  });
  assert.equal(preparingOrder.status, 'preparing');
  assert.equal(
    applyCustomerOrderStatusEvent(preparingOrder, {
      orderId: initialOrder.orderId,
      status: 'accepted',
      updatedAt: '2026-11-20T10:03:00.000Z',
    }),
    preparingOrder
  );
  assert.equal(canCancelCustomerOrder('new'), true);
  assert.equal(canCancelCustomerOrder('completed'), false);
  assert.equal(canCancelCustomerOrder('cancelled'), false);

  const socket = new FakeSocket();
  const states = [];
  let resolveCancellation;
  let cancellationCalls = 0;
  const session = createCustomerOrderStatusSession({
    socket,
    initialOrder,
    cancelOrder: () => {
      cancellationCalls += 1;
      return new Promise((resolve) => { resolveCancellation = resolve; });
    },
    onStateChange: (state) => states.push(state),
  });
  session.start();
  assert.equal(socket.connectCalls, 1);
  socket.emitTest('connect');
  assert.equal(states.at(-1).connectionStatus, 'connected');
  socket.emitTest('disconnect');
  assert.equal(states.at(-1).connectionStatus, 'disconnected');
  socket.emitTest('connect');
  assert.equal(states.at(-1).connectionStatus, 'connected');
  socket.emitTest(CUSTOMER_ORDER_STATUS_EVENT, {
    orderId: 'OTHER', status: 'accepted', updatedAt: '2026-11-20T10:01:00.000Z',
  });
  assert.equal(states.at(-1).order.status, 'new');

  const firstCancellation = session.cancel();
  const duplicateCancellation = await session.cancel();
  assert.equal(duplicateCancellation, false);
  assert.equal(cancellationCalls, 1);
  assert.equal(states.at(-1).isCancelling, true);
  assert.equal(states.at(-1).order.status, 'new');
  resolveCancellation({
    ...initialOrder,
    status: 'cancelled',
    updatedAt: '2026-11-20T10:04:00.000Z',
  });
  assert.equal(await firstCancellation, true);
  assert.equal(states.at(-1).order.status, 'cancelled');
  assert.equal(states.at(-1).isCancelling, false);
  session.stop();
  assert.equal(socket.listenerCount(), 0);
  assert.equal(socket.disconnectCalls, 1);

  const conflictSocket = new FakeSocket();
  const conflictStates = [];
  const conflictSession = createCustomerOrderStatusSession({
    socket: conflictSocket,
    initialOrder,
    cancelOrder: async () => {
      const error = new Error('conflict');
      error.response = { status: 409 };
      throw error;
    },
    onStateChange: (state) => conflictStates.push(state),
  });
  conflictSession.start();
  assert.equal(await conflictSession.cancel(), false);
  assert.equal(conflictStates.at(-1).order.status, 'new');
  assert.match(conflictStates.at(-1).cancellationError, /kitchen accepted/i);
  conflictSession.stop();

  const failureSocket = new FakeSocket();
  const failureStates = [];
  const failureSession = createCustomerOrderStatusSession({
    socket: failureSocket,
    initialOrder,
    cancelOrder: async () => { throw new Error('network'); },
    onStateChange: (state) => failureStates.push(state),
  });
  failureSession.start();
  assert.equal(await failureSession.cancel(), false);
  assert.equal(failureStates.at(-1).order.status, 'new');
  assert.match(failureStates.at(-1).cancellationError, /could not confirm/i);
  failureSession.stop();

  console.log('FR-07/FR-08 customer order status tests passed (51/51).');
} finally {
  await viteServer.close();
}
