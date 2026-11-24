import assert from 'node:assert/strict';
import express from 'express';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  ORDER_TRANSITION_ERROR_CODES,
  isKnownOrderStatus,
  isTerminalOrderStatus,
  validateOrderStatusTransition,
} from '../utils/orderStatusTransitions.js';
import { kitchenOrderStatusUpdateValidator } from '../validators/kitchenOrderStatusValidators.js';

const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
}

function expectValid(currentStatus, nextStatus, actor) {
  assert.deepEqual(
    validateOrderStatusTransition({ currentStatus, nextStatus, actor }),
    { valid: true, code: null, message: null }
  );
}

function expectInvalid(currentStatus, nextStatus, actor, code) {
  const result = validateOrderStatusTransition({ currentStatus, nextStatus, actor });
  assert.equal(result.valid, false);
  assert.equal(result.code, code);
  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0);
}

function createValidatorApp() {
  const app = express();
  app.use(express.json());
  app.patch('/status', kitchenOrderStatusUpdateValidator, validateRequest, (_req, res) => {
    res.status(200).json({ success: true });
  });
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
      details: error.details,
    });
  });
  return app;
}

test('all database order statuses are recognized', () => {
  ['new', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'].forEach(
    (status) => assert.equal(isKnownOrderStatus(status), true)
  );
  assert.equal(isKnownOrderStatus('unknown'), false);
});

test('completed and cancelled are terminal statuses', () => {
  assert.equal(isTerminalOrderStatus('completed'), true);
  assert.equal(isTerminalOrderStatus('cancelled'), true);
  assert.equal(isTerminalOrderStatus('ready'), false);
});

[
  ['new', 'accepted', 'kitchen'],
  ['accepted', 'preparing', 'kitchen'],
  ['preparing', 'ready', 'kitchen'],
  ['ready', 'completed', 'kitchen'],
  ['new', 'cancelled', 'customer'],
].forEach(([currentStatus, nextStatus, actor]) => {
  test(`${actor} may move ${currentStatus} to ${nextStatus}`, () => {
    expectValid(currentStatus, nextStatus, actor);
  });
});

[
  ['new', 'preparing'],
  ['new', 'ready'],
  ['accepted', 'ready'],
  ['preparing', 'accepted'],
  ['ready', 'preparing'],
].forEach(([currentStatus, nextStatus]) => {
  test(`rejects invalid transition ${currentStatus} to ${nextStatus}`, () => {
    expectInvalid(
      currentStatus,
      nextStatus,
      'kitchen',
      ORDER_TRANSITION_ERROR_CODES.INVALID_TRANSITION
    );
  });
});

test('rejects transitions from completed', () => {
  expectInvalid(
    'completed',
    'accepted',
    'kitchen',
    ORDER_TRANSITION_ERROR_CODES.TERMINAL_STATUS
  );
});

test('rejects transitions from cancelled', () => {
  expectInvalid(
    'cancelled',
    'accepted',
    'kitchen',
    ORDER_TRANSITION_ERROR_CODES.TERMINAL_STATUS
  );
});

test('rejects a repeated same-status transition', () => {
  expectInvalid(
    'accepted',
    'accepted',
    'kitchen',
    ORDER_TRANSITION_ERROR_CODES.DUPLICATE_TRANSITION
  );
});

test('kitchen cannot cancel an order', () => {
  expectInvalid(
    'new',
    'cancelled',
    'kitchen',
    ORDER_TRANSITION_ERROR_CODES.ACTOR_NOT_AUTHORIZED
  );
});

test('customer cannot perform a kitchen transition', () => {
  expectInvalid(
    'new',
    'accepted',
    'customer',
    ORDER_TRANSITION_ERROR_CODES.ACTOR_NOT_AUTHORIZED
  );
});

test('customer cancellation is only valid from new', () => {
  expectValid('new', 'cancelled', 'customer');
  expectInvalid(
    'accepted',
    'cancelled',
    'customer',
    ORDER_TRANSITION_ERROR_CODES.INVALID_TRANSITION
  );
});

test('unknown statuses and actors have stable error codes', () => {
  expectInvalid(
    'missing',
    'accepted',
    'kitchen',
    ORDER_TRANSITION_ERROR_CODES.UNKNOWN_CURRENT_STATUS
  );
  expectInvalid(
    'new',
    'missing',
    'kitchen',
    ORDER_TRANSITION_ERROR_CODES.UNKNOWN_REQUESTED_STATUS
  );
  expectInvalid(
    'new',
    'accepted',
    'admin',
    ORDER_TRANSITION_ERROR_CODES.UNKNOWN_ACTOR
  );
});

const validatorApp = createValidatorApp();
const validatorServer = await new Promise((resolve) => {
  const server = validatorApp.listen(0, '127.0.0.1', () => resolve(server));
});
const validatorAddress = validatorServer.address();
const validatorUrl = `http://127.0.0.1:${validatorAddress.port}/status`;

async function sendStatusPayload(payload) {
  const response = await fetch(validatorUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

for (const status of ['accepted', 'preparing', 'ready', 'completed']) {
  test(`request validator accepts kitchen target status ${status}`, async () => {
    const response = await sendStatusPayload({ status });
    assert.equal(response.status, 200);
  });
}

[
  [{}, 'Status is required.'],
  [{ status: '' }, 'Status is required.'],
  [{ status: 1 }, 'Status must be a string.'],
  [{ status: null }, 'Status is required.'],
  [{ status: 'unknown' }, 'Status must be accepted, preparing, ready or completed.'],
  [{ status: 'accepted', currentStatus: 'new' }, 'Request body may only contain the status field.'],
].forEach(([payload, expectedMessage]) => {
  test(`request validator rejects ${JSON.stringify(payload)}`, async () => {
    const response = await sendStatusPayload(payload);
    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.ok(response.body.details.some((detail) => detail.message === expectedMessage));
  });
});

let passed = 0;

for (const currentTest of tests) {
  try {
    await currentTest.callback();
    passed += 1;
  } catch (error) {
    console.error(`FAIL: ${currentTest.name}`);
    throw error;
  }
}

await new Promise((resolve, reject) => {
  validatorServer.close((error) => (error ? reject(error) : resolve()));
});

console.log(`FR-07 transition and validator tests passed (${passed}/${tests.length}).`);
