import assert from 'node:assert/strict';
import { getOrderDisplayNumber } from '../utils/orderDisplayNumber.js';

assert.equal(
  getOrderDisplayNumber({
    orderId: 'ORD-66e38b92-728e-48c1-bca9-12af1f2911ab',
    tableDisplayLabel: 'T01',
  }),
  'T01-911AB'
);
assert.equal(getOrderDisplayNumber('ORD-12345678', 'T05'), 'T05-45678');
assert.equal(getOrderDisplayNumber({ orderId: 'ORD-ABCDE', tableNumber: 'T02' }), 'T02-ABCDE');
assert.equal(getOrderDisplayNumber(null), '');

console.log('Short order display-number tests passed: 4/4');
