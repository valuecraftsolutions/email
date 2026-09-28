import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { sanitizeAuditMetadata } from '../src/services/security/auditService.js';
import { createEncryptionService } from '../src/services/security/encryptionService.js';
import { createTestApp } from './helpers/testApp.js';

const key = Buffer.alloc(32, 3);

test('encryption round-trips and binds ciphertext to associated data', () => {
  const service = createEncryptionService({ key, keyId: 'k1' });
  const encrypted = service.encrypt('mailbox-password', 'mailbox:1');
  assert.match(encrypted, /^v1:k1:/);
  assert.ok(!encrypted.includes('mailbox-password'));
  assert.notEqual(encrypted, service.encrypt('mailbox-password', 'mailbox:1'));
  assert.equal(service.decrypt(encrypted, 'mailbox:1'), 'mailbox-password');
  assert.throws(() => service.decrypt(encrypted, 'mailbox:2'));

  const parts = encrypted.split(':');
  parts[4] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => service.decrypt(parts.join(':'), 'mailbox:1'));

  const otherKey = createEncryptionService({
    key: Buffer.alloc(32, 4),
    keyId: 'k1',
  });
  assert.throws(() => otherKey.decrypt(encrypted, 'mailbox:1'));
});

test('encryption refuses to operate without a key', () => {
  const service = createEncryptionService({ key: null, keyId: 'k1' });
  assert.equal(service.isConfigured(), false);
  assert.throws(() => service.encrypt('x'), /not configured/);
});

test('audit metadata strips credentials and bounds size', () => {
  const clean = sanitizeAuditMetadata({
    email: 'a@b.com',
    password: 'secret',
    nested: { accessToken: 't', refresh_token: 'r', apiKey: 'k', ok: 1 },
    headers: { Authorization: 'Bearer x', Cookie: 'c' },
    long: 'x'.repeat(2000),
  });
  assert.equal(clean.email, 'a@b.com');
  assert.equal(clean.password, undefined);
  assert.deepEqual(clean.nested, { ok: 1 });
  assert.deepEqual(clean.headers, {});
  assert.equal(clean.long.length, 500);
});

test('security headers are applied and stack traces are never returned', async (t) => {
  const { app, close } = await createTestApp();
  t.after(close);
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { success: true, data: { status: 'ok' } });
  assert.equal(res.headers['x-powered-by'], undefined);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.headers['content-security-policy'], /default-src 'none'/);
  assert.match(res.headers['x-request-id'], /^[0-9a-f-]{36}$/);

  const ready = await request(app).get('/api/health/ready');
  assert.equal(ready.status, 200);
});

test('CORS only reflects the configured application origin', async (t) => {
  const { app, close } = await createTestApp();
  t.after(close);
  const allowed = await request(app)
    .options('/api/auth/login')
    .set('Origin', 'http://localhost:4601')
    .set('Access-Control-Request-Method', 'POST');
  assert.equal(
    allowed.headers['access-control-allow-origin'],
    'http://localhost:4601',
  );
  assert.equal(allowed.headers['access-control-allow-credentials'], 'true');

  const blocked = await request(app)
    .options('/api/auth/login')
    .set('Origin', 'https://evil.example')
    .set('Access-Control-Request-Method', 'POST');
  assert.equal(blocked.headers['access-control-allow-origin'], undefined);
});
