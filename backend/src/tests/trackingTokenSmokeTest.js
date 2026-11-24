import assert from 'node:assert/strict';
import {
  generateTrackingToken,
  hashTrackingToken,
  isValidTrackingToken,
  verifyTrackingToken,
} from '../utils/trackingToken.js';

const token = generateTrackingToken();
const hash = hashTrackingToken(token);

assert.equal(token.length, 43);
assert.equal(Buffer.from(token, 'base64url').length, 32);
assert.match(token, /^[A-Za-z0-9_-]{43}$/);

const generatedTokens = new Set(
  Array.from({ length: 100 }, () => generateTrackingToken())
);
assert.equal(generatedTokens.size, 100);

assert.equal(hash.length, 64);
assert.match(hash, /^[0-9a-f]{64}$/);
assert.equal(hashTrackingToken(token), hash);

assert.equal(verifyTrackingToken(token, hash), true);
assert.equal(verifyTrackingToken(generateTrackingToken(), hash), false);

assert.equal(isValidTrackingToken(token), true);
assert.equal(isValidTrackingToken('too-short'), false);
assert.equal(isValidTrackingToken(null), false);
assert.throws(() => hashTrackingToken('malformed'), TypeError);
assert.throws(() => hashTrackingToken(undefined), TypeError);

const malformedInputs = [
  [undefined, hash],
  [null, hash],
  ['', hash],
  ['malformed', hash],
  [token, undefined],
  [token, null],
  [token, ''],
  [token, 'a'.repeat(63)],
  [token, 'A'.repeat(64)],
  [token, 'g'.repeat(64)],
];

malformedInputs.forEach(([candidateToken, candidateHash]) => {
  assert.equal(verifyTrackingToken(candidateToken, candidateHash), false);
});

console.log('FR-08 tracking token helper tests passed (24/24).');
