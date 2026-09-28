import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const generateToken = (bytes = 32) =>
  randomBytes(bytes).toString('base64url');

export const sha256 = (value) =>
  createHash('sha256').update(value).digest('hex');

export const hmac = (secret, value) =>
  createHmac('sha256', secret).update(value).digest('base64url');

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
