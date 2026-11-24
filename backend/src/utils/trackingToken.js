import crypto from 'crypto';

const TRACKING_TOKEN_BYTES = 32;
const TRACKING_TOKEN_LENGTH = 43;
const TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TRACKING_TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function isValidTrackingToken(value) {
  return typeof value === 'string' &&
    value.length === TRACKING_TOKEN_LENGTH &&
    TRACKING_TOKEN_PATTERN.test(value);
}

export function generateTrackingToken() {
  return crypto.randomBytes(TRACKING_TOKEN_BYTES).toString('base64url');
}

export function hashTrackingToken(token) {
  if (!isValidTrackingToken(token)) {
    throw new TypeError('Invalid tracking token.');
  }

  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function verifyTrackingToken(token, expectedHash) {
  if (
    !isValidTrackingToken(token) ||
    typeof expectedHash !== 'string' ||
    !TRACKING_TOKEN_HASH_PATTERN.test(expectedHash)
  ) {
    return false;
  }

  const actualHashBuffer = Buffer.from(hashTrackingToken(token), 'hex');
  const expectedHashBuffer = Buffer.from(expectedHash, 'hex');

  if (actualHashBuffer.length !== expectedHashBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualHashBuffer, expectedHashBuffer);
}
