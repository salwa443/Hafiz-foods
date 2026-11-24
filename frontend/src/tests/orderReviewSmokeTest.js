import assert from 'node:assert/strict';
import { buildOrderPayload } from '../utils/orderPayload.js';

const cartItems = [
  {
    lineId: '[12,"No onions"]',
    menuItemId: 12,
    name: 'Burger',
    unitPriceMinor: 1250,
    quantity: 2,
    specialInstructions: '  No onions  ',
    imageUrl: '/uploads/menu/burger.webp',
  },
];

const payload = buildOrderPayload(cartItems, 'pay_at_table');

assert.deepEqual(payload, {
  paymentMethod: 'pay_at_table',
  items: [
    {
      menuItemId: 12,
      quantity: 2,
      specialInstructions: 'No onions',
    },
  ],
});
assert.equal('totalAmount' in payload, false);
assert.equal('tableId' in payload, false);
assert.equal('price' in payload.items[0], false);
assert.equal('subtotal' in payload.items[0], false);
assert.throws(() => buildOrderPayload(cartItems, 'card'));
assert.throws(() => buildOrderPayload([], 'cash'));
assert.throws(() => buildOrderPayload([{ menuItemId: 0, quantity: 1 }], 'cash'));
assert.throws(() => buildOrderPayload([{ menuItemId: 1, quantity: 0 }], 'cash'));

console.log('FR-05 order review payload tests passed (8/8).');
