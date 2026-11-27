import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { buildOrderPayload } from '../utils/orderPayload.js';
import {
  getCustomerOrderErrorMessage,
  getOrderSubmitButtonState,
  submitOrderOnce,
} from '../utils/orderSubmission.js';

globalThis.sessionStorage = {
  getItem() {
    return null;
  },
};

const cartItems = [
  {
    menuItemId: 8,
    name: 'Pizza',
    unitPriceMinor: 1500,
    quantity: 2,
    specialInstructions: 'Extra crisp',
  },
];
const payload = buildOrderPayload(cartItems, 'pay_at_counter');
const backendOrder = {
  orderId: 'ORD-11111111-2222-4333-8444-555555555555',
  tableNumber: 'T05',
  paymentMethod: 'pay_at_counter',
  totalAmount: '30.00',
  orderTime: '2026-11-20T10:15:30.000Z',
  status: 'new',
  items: [],
};

const viteServer = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const [{ default: apiClient }, { placeCustomerOrder }, { default: OrderConfirmation }] =
  await Promise.all([
    viteServer.ssrLoadModule('/src/services/apiClient.js'),
    viteServer.ssrLoadModule('/src/services/customerOrderService.js'),
    viteServer.ssrLoadModule('/src/components/customer/OrderConfirmation.jsx'),
  ]);
const originalAdapter = apiClient.defaults.adapter;
let capturedConfig;

try {
  apiClient.defaults.adapter = async (config) => {
    capturedConfig = config;
    return {
      data: { success: true, data: { order: backendOrder } },
      status: 201,
      statusText: 'Created',
      headers: {},
      config,
    };
  };

  const serviceResult = await placeCustomerOrder('T05', 'memory-only-token', payload);
  assert.deepEqual(serviceResult, backendOrder);
  assert.equal(capturedConfig.method, 'post');
  assert.equal(capturedConfig.url, '/public/tables/T05/orders');
  assert.deepEqual(capturedConfig.params, { token: 'memory-only-token' });
  assert.deepEqual(JSON.parse(capturedConfig.data), payload);
  assert.equal('totalAmount' in JSON.parse(capturedConfig.data), false);

  let resolveRequest;
  let requestCount = 0;
  let clearCount = 0;
  const pendingStates = [];
  const submissionLock = { current: false };
  const requestPromise = new Promise((resolve) => {
    resolveRequest = resolve;
  });
  const submissionOptions = {
    submissionLock,
    request: () => {
      requestCount += 1;
      return requestPromise;
    },
    onPending: (pending) => pendingStates.push(pending),
    onSuccess: () => {
      clearCount += 1;
    },
    onError: () => {},
  };

  const firstSubmission = submitOrderOnce(submissionOptions);
  const repeatedSubmission = await submitOrderOnce(submissionOptions);
  assert.equal(repeatedSubmission, false);
  assert.equal(requestCount, 1);
  assert.deepEqual(pendingStates, [true]);
  assert.deepEqual(getOrderSubmitButtonState(true), {
    disabled: true,
    label: 'Confirming order…',
  });

  resolveRequest(backendOrder);
  assert.equal(await firstSubmission, true);
  assert.deepEqual(pendingStates, [true, false]);
  assert.deepEqual(getOrderSubmitButtonState(false), {
    disabled: false,
    label: 'Confirm order',
  });
  assert.equal(clearCount, 1);

  let failureMessage = '';
  clearCount = 0;
  const failed = await submitOrderOnce({
    submissionLock: { current: false },
    request: async () => {
      throw { response: { status: 400, data: { message: 'One or more menu items are unavailable.' } } };
    },
    onPending: () => {},
    onSuccess: () => {
      clearCount += 1;
    },
    onError: (message) => {
      failureMessage = message;
    },
  });
  assert.equal(failed, false);
  assert.equal(clearCount, 0);
  assert.match(failureMessage, /no longer available/i);

  assert.match(
    getCustomerOrderErrorMessage({ response: { status: 404 } }),
    /QR code is no longer valid/i
  );
  assert.match(
    getCustomerOrderErrorMessage(new Error('Network Error')),
    /could not confirm whether your order was received/i
  );

  const confirmationHtml = renderToStaticMarkup(
    createElement(OrderConfirmation, { order: backendOrder, onClose: () => {} })
  );
  assert.match(confirmationHtml, /T05-55555/);
  assert.doesNotMatch(confirmationHtml, /ORD-11111111-2222-4333-8444-555555555555/);
  assert.match(confirmationHtml, /T05/);
  assert.match(confirmationHtml, /Pay at counter/);
  assert.match(confirmationHtml, /30\.00/);
  assert.match(confirmationHtml, /2026-11-20T10:15:30\.000Z/);

  console.log('FR-05 order submission frontend tests passed (22/22).');
} finally {
  apiClient.defaults.adapter = originalAdapter;
  await viteServer.close();
}
