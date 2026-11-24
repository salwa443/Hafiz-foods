import assert from 'node:assert/strict';
import {
  CART_ACTIONS,
  cartReducer,
  initialCartState,
} from '../reducers/cartReducer.js';
import {
  calculateCartQuantity,
  calculateCartSubtotalMinor,
  calculateCartTotalMinor,
  createCartLineSignature,
  normalizeSpecialInstructions,
  priceToMinorUnits,
} from '../utils/cartCalculations.js';
import {
  clearStoredCart,
  getCartStorageKey,
  loadStoredCart,
  saveStoredCart,
} from '../services/cartStorageService.js';

const results = [];

function record(name, test) {
  try {
    test();
    results.push({ test: name, status: 'PASS' });
  } catch (error) {
    results.push({ test: name, status: 'FAIL', detail: error.message });
  }
}

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

function availableItem(overrides = {}) {
  return {
    id: 11,
    name: 'Test Burger',
    price: '850.25',
    image_url: '/uploads/menu/test.webp',
    is_available: true,
    ...overrides,
  };
}

function reduce(state, type, payload) {
  return cartReducer(state, { type, payload });
}

record('normalizes special instructions and creates stable signatures', () => {
  assert.equal(normalizeSpecialInstructions('  no onions  '), 'no onions');
  assert.equal(
    createCartLineSignature(11, ' no onions '),
    createCartLineSignature(11, 'no onions')
  );
});

record('converts trusted menu prices to integer minor units', () => {
  assert.equal(priceToMinorUnits('850.25'), 85025);
  assert.equal(priceToMinorUnits(0), 0);
  assert.throws(() => priceToMinorUnits(-1));
});

record('adds an available menu item', () => {
  const state = reduce(initialCartState, CART_ACTIONS.ADD_ITEM, {
    menuItem: availableItem(),
    quantity: 1,
    specialInstructions: '',
  });

  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].unitPriceMinor, 85025);
  assert.equal(state.items[0].quantity, 1);
});

record('rejects unavailable items and invalid quantities', () => {
  const unavailableState = reduce(initialCartState, CART_ACTIONS.ADD_ITEM, {
    menuItem: availableItem({ is_available: false }),
    quantity: 1,
  });
  const invalidQuantityState = reduce(initialCartState, CART_ACTIONS.ADD_ITEM, {
    menuItem: availableItem(),
    quantity: 0,
  });

  assert.equal(unavailableState, initialCartState);
  assert.equal(invalidQuantityState, initialCartState);
});

record('merges identical items with identical instructions', () => {
  let state = reduce(initialCartState, CART_ACTIONS.ADD_ITEM, {
    menuItem: availableItem(),
    quantity: 1,
    specialInstructions: 'No onions',
  });
  state = reduce(state, CART_ACTIONS.ADD_ITEM, {
    menuItem: availableItem(),
    quantity: 2,
    specialInstructions: '  No onions  ',
  });

  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].quantity, 3);
});

record('keeps entries with different instructions separate', () => {
  let state = reduce(initialCartState, CART_ACTIONS.ADD_ITEM, {
    menuItem: availableItem(),
    specialInstructions: 'No onions',
  });
  state = reduce(state, CART_ACTIONS.ADD_ITEM, {
    menuItem: availableItem(),
    specialInstructions: 'Extra sauce',
  });

  assert.equal(state.items.length, 2);
});

record('increases quantity and never decreases below one', () => {
  let state = reduce(initialCartState, CART_ACTIONS.ADD_ITEM, {
    menuItem: availableItem(),
  });
  const lineId = state.items[0].lineId;
  state = reduce(state, CART_ACTIONS.INCREASE_QUANTITY, { lineId });
  assert.equal(state.items[0].quantity, 2);
  state = reduce(state, CART_ACTIONS.DECREASE_QUANTITY, { lineId });
  state = reduce(state, CART_ACTIONS.DECREASE_QUANTITY, { lineId });
  assert.equal(state.items[0].quantity, 1);
});

record('removes an item only through the remove action', () => {
  let state = reduce(initialCartState, CART_ACTIONS.ADD_ITEM, {
    menuItem: availableItem(),
  });
  state = reduce(state, CART_ACTIONS.REMOVE_ITEM, {
    lineId: state.items[0].lineId,
  });
  assert.deepEqual(state.items, []);
});

record('updates instructions and merges a newly identical line', () => {
  let state = reduce(initialCartState, CART_ACTIONS.ADD_ITEM, {
    menuItem: availableItem(),
    quantity: 1,
    specialInstructions: 'No onions',
  });
  state = reduce(state, CART_ACTIONS.ADD_ITEM, {
    menuItem: availableItem(),
    quantity: 2,
    specialInstructions: 'Extra sauce',
  });
  const extraSauceLine = state.items.find(
    (item) => item.specialInstructions === 'Extra sauce'
  );
  state = reduce(state, CART_ACTIONS.UPDATE_INSTRUCTIONS, {
    lineId: extraSauceLine.lineId,
    specialInstructions: 'No onions',
  });

  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].quantity, 3);
});

record('calculates subtotal, total and cart quantity correctly', () => {
  const items = [
    { unitPriceMinor: 85025, quantity: 2 },
    { unitPriceMinor: 10000, quantity: 3 },
  ];

  assert.equal(calculateCartSubtotalMinor(items), 200050);
  assert.equal(calculateCartTotalMinor(items), 200050);
  assert.equal(calculateCartQuantity(items), 5);
});

record('clears all cart entries', () => {
  const populatedState = {
    items: [{ lineId: 'line', unitPriceMinor: 100, quantity: 1 }],
  };
  const state = reduce(populatedState, CART_ACTIONS.CLEAR_CART);
  assert.deepEqual(state, { items: [] });
});

record('persists carts under table-scoped session keys without QR tokens', () => {
  const storage = createMemoryStorage();
  const item = {
    lineId: createCartLineSignature(11, ''),
    menuItemId: 11,
    name: 'Test Burger',
    imageUrl: null,
    unitPriceMinor: 85025,
    quantity: 1,
    specialInstructions: '',
  };

  saveStoredCart(1, [item], storage);
  const rawValue = storage.getItem(getCartStorageKey(1));

  assert.ok(rawValue);
  assert.equal(rawValue.includes('qrToken'), false);
  assert.equal(rawValue.includes('secret-token'), false);
  assert.equal(loadStoredCart(2, storage).items.length, 0);
  assert.equal(loadStoredCart(1, storage).items.length, 1);
});

record('ignores malformed stored carts and invalid stored items safely', () => {
  const storage = createMemoryStorage();
  storage.setItem(getCartStorageKey(1), '{bad json');
  assert.deepEqual(loadStoredCart(1, storage), { items: [] });

  storage.setItem(
    getCartStorageKey(1),
    JSON.stringify({ version: 1, tableId: 1, items: [{ quantity: -2 }] })
  );
  assert.deepEqual(loadStoredCart(1, storage), { items: [] });
});

record('merges duplicate stored lines and clears empty storage', () => {
  const storage = createMemoryStorage();
  const storedItem = {
    menuItemId: 11,
    name: 'Test Burger',
    imageUrl: null,
    unitPriceMinor: 85025,
    quantity: 1,
    specialInstructions: 'No onions',
  };
  storage.setItem(
    getCartStorageKey(1),
    JSON.stringify({
      version: 1,
      tableId: 1,
      items: [storedItem, { ...storedItem, quantity: 2 }],
    })
  );

  const restored = loadStoredCart(1, storage);
  assert.equal(restored.items.length, 1);
  assert.equal(restored.items[0].quantity, 3);

  clearStoredCart(1, storage);
  assert.equal(storage.getItem(getCartStorageKey(1)), null);
});

record('supports the complete cart UI quantity and summary workflow', () => {
  let state = reduce(initialCartState, CART_ACTIONS.ADD_ITEM, {
    menuItem: availableItem(),
    quantity: 2,
    specialInstructions: 'No onions',
  });
  state = reduce(state, CART_ACTIONS.ADD_ITEM, {
    menuItem: availableItem(),
    quantity: 1,
    specialInstructions: 'Extra sauce',
  });

  assert.equal(state.items.length, 2);
  assert.equal(calculateCartQuantity(state.items), 3);
  assert.equal(calculateCartSubtotalMinor(state.items), 255075);
  assert.equal(calculateCartTotalMinor(state.items), 255075);

  const firstLineId = state.items[0].lineId;
  state = reduce(state, CART_ACTIONS.INCREASE_QUANTITY, { lineId: firstLineId });
  assert.equal(calculateCartQuantity(state.items), 4);
  assert.equal(calculateCartSubtotalMinor(state.items), 340100);

  state = reduce(state, CART_ACTIONS.REMOVE_ITEM, { lineId: firstLineId });
  assert.equal(state.items.length, 1);
  assert.equal(calculateCartQuantity(state.items), 1);
  assert.equal(calculateCartSubtotalMinor(state.items), 85025);
});

record('handles zero-priced menu items in cart totals', () => {
  const state = reduce(initialCartState, CART_ACTIONS.ADD_ITEM, {
    menuItem: availableItem({ id: 12, name: 'Complimentary Water', price: '0.00' }),
    quantity: 3,
  });

  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].unitPriceMinor, 0);
  assert.equal(calculateCartQuantity(state.items), 3);
  assert.equal(calculateCartSubtotalMinor(state.items), 0);
  assert.equal(calculateCartTotalMinor(state.items), 0);
});

console.table(results);

const failures = results.filter((result) => result.status === 'FAIL');

if (failures.length > 0) {
  throw new Error(`${failures.length} FR-04 cart core test(s) failed.`);
} else {
  console.log(`FR-04 cart core smoke tests passed: ${results.length}/${results.length}`);
}
