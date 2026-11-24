import assert from 'node:assert/strict';
import { sanitizeRequestUrl } from '../utils/sanitizeRequestUrl.js';

assert.equal(
  sanitizeRequestUrl('/api/public/tables/T01/orders?token=secret-qr-token'),
  '/api/public/tables/T01/orders?token=%5BREDACTED%5D'
);
assert.equal(
  sanitizeRequestUrl('/api/public/menu/items?search=pizza&categoryId=2'),
  '/api/public/menu/items?search=pizza&categoryId=2'
);
assert.equal(sanitizeRequestUrl('http://['), '[INVALID_URL]');

console.log('Request log sanitization tests passed (3/3).');
