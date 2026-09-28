import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config/env.js';

const base = {
  DATABASE_URL: 'postgres://localhost/vcm_mail',
  SESSION_SECRET: 'a-random-session-secret-with-enough-length-1234',
};

test('loads development defaults', () => {
  const config = loadConfig(base);
  assert.equal(config.env, 'development');
  assert.equal(config.server.port, 4600);
  assert.equal(config.session.cookieSecure, false);
  assert.equal(config.session.cookieName, 'vcm_session');
  assert.deepEqual(config.corsOrigins, ['http://localhost:4601']);
});

test('requires a strong session secret and database settings', () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: base.DATABASE_URL }),
    /SESSION_SECRET/,
  );
  assert.throws(
    () => loadConfig({ SESSION_SECRET: base.SESSION_SECRET }),
    /DATABASE_URL/,
  );
  assert.throws(
    () =>
      loadConfig({
        ...base,
        SESSION_SECRET: 'replace-with-a-long-random-value-000000',
      }),
    /placeholder/,
  );
});

test('production enforces https origin, secure cookies and an encryption key', () => {
  assert.throws(
    () => loadConfig({ ...base, NODE_ENV: 'production' }),
    (error) =>
      /MAILBOX_ENCRYPTION_KEY/.test(error.message) &&
      /APP_ORIGIN/.test(error.message),
  );
  const config = loadConfig({
    ...base,
    NODE_ENV: 'production',
    APP_ORIGIN: 'https://mail.valuecraftminds.com',
    MAILBOX_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  });
  assert.equal(config.session.cookieSecure, true);
  assert.equal(config.session.cookieName, '__Host-vcm_session');
  assert.throws(
    () =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://mail.valuecraftminds.com',
        MAILBOX_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
        COOKIE_SECURE: 'false',
      }),
    /COOKIE_SECURE/,
  );
});

test('rejects an encryption key of the wrong length without echoing it', () => {
  const key = Buffer.alloc(16, 9).toString('base64');
  assert.throws(
    () => loadConfig({ ...base, MAILBOX_ENCRYPTION_KEY: key }),
    (error) =>
      /32 random bytes/.test(error.message) && !error.message.includes(key),
  );
});
