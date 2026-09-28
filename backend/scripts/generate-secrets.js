// Prints fresh random values for backend/.env. Copy them in; never commit them.
import { randomBytes } from 'node:crypto';

console.log(`SESSION_SECRET=${randomBytes(48).toString('base64url')}`);
console.log(`MAILBOX_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`);
