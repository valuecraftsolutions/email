import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  createTestApp,
  DEFAULT_PASSWORD,
  signIn,
  TEST_ORIGIN,
} from './helpers/testApp.js';

const EMAIL = 'employee@valuecraftminds.com';

async function setup(t, overrides) {
  const ctx = await createTestApp(overrides);
  t.after(() => ctx.close());
  return ctx;
}

const auditActions = async (db) =>
  (
    await db.query(
      'SELECT action, outcome, metadata FROM audit_logs ORDER BY id',
    )
  ).rows;

test('successful login sets a hardened session cookie and returns permissions', async (t) => {
  const { app, db, createUser } = await setup(t);
  await createUser({ email: EMAIL });

  const res = await request(app)
    .post('/api/auth/login')
    .set('Origin', TEST_ORIGIN)
    .send({
      email: '  Employee@ValueCraftMinds.com ',
      password: DEFAULT_PASSWORD,
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.user.email, EMAIL);
  assert.match(res.body.data.user.userCode, /^USR\d{4}$/);
  assert.ok(res.body.data.permissions.includes('mail.read_own'));
  assert.ok(!res.body.data.permissions.includes('users.read'));
  assert.equal(typeof res.body.data.csrfToken, 'string');
  assert.equal(JSON.stringify(res.body).includes('password'), false);

  const cookie = res.headers['set-cookie'][0];
  assert.match(cookie, /^vcm_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);

  // Only the hash of the token is persisted.
  const token = decodeURIComponent(cookie.split(';')[0].split('=')[1]);
  const { rows } = await db.query('SELECT token_hash FROM sessions');
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, token);
  assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);

  assert.equal(res.headers['cache-control'], 'no-store');
  assert.ok((await auditActions(db)).some((a) => a.action === 'auth.login'));
});

test('wrong password and unknown email return the same generic error', async (t) => {
  const { app, db, createUser } = await setup(t);
  await createUser({ email: EMAIL });

  const wrong = await request(app)
    .post('/api/auth/login')
    .send({ email: EMAIL, password: 'not-the-password' });
  const unknown = await request(app).post('/api/auth/login').send({
    email: 'nobody@valuecraftminds.com',
    password: 'whatever-password',
  });

  for (const res of [wrong, unknown]) {
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(res.body.error.message, 'Invalid email or password.');
    assert.equal(res.headers['set-cookie'], undefined);
  }

  const audits = await auditActions(db);
  const failures = audits.filter((a) => a.action === 'auth.login_failed');
  assert.equal(failures.length, 2);
  for (const entry of failures) {
    const text = JSON.stringify(entry.metadata);
    assert.ok(!text.includes('not-the-password'));
    assert.ok(!text.includes('whatever-password'));
  }
});

test('login validation errors use the standard envelope', async (t) => {
  const { app } = await setup(t);
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'not-an-email', password: '' });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'VALIDATION_FAILED');
  const fields = res.body.error.details.map((d) => d.field).sort();
  assert.deepEqual(fields, ['email', 'password']);
  assert.equal(res.body.error.stack, undefined);
});

test('account locks after repeated failures', async (t) => {
  const { app, db, createUser } = await setup(t, {
    ACCOUNT_LOCKOUT_THRESHOLD: '3',
  });
  await createUser({ email: EMAIL });
  for (let i = 0; i < 3; i++)
    await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'bad-password' });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: EMAIL, password: DEFAULT_PASSWORD });
  assert.equal(res.status, 423);
  assert.equal(res.body.error.code, 'ACCOUNT_LOCKED');
  assert.ok(
    (await auditActions(db)).some((a) => a.action === 'auth.account_locked'),
  );
});

test('login is rate limited per IP', async (t) => {
  const { app } = await setup(t, { LOGIN_RATE_LIMIT_MAX: '2' });
  const attempt = () =>
    request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'bad-password' });
  await attempt();
  await attempt();
  const res = await attempt();
  assert.equal(res.status, 429);
  assert.equal(res.body.error.code, 'RATE_LIMITED');
});

test('inactive, suspended and pending users cannot sign in', async (t) => {
  const { app, createUser } = await setup(t);
  for (const status of ['INACTIVE', 'SUSPENDED', 'PENDING']) {
    const email = `${status.toLowerCase()}@valuecraftminds.com`;
    await createUser({ email, status });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: DEFAULT_PASSWORD });
    assert.equal(res.status, 403, status);
    assert.equal(res.body.error.code, 'ACCOUNT_NOT_ACTIVE');
  }
});

test('protected endpoints reject missing or forged sessions', async (t) => {
  const { app } = await setup(t);
  const missing = await request(app).get('/api/auth/me');
  assert.equal(missing.status, 401);
  assert.equal(missing.body.error.code, 'UNAUTHENTICATED');

  const forged = await request(app)
    .get('/api/auth/me')
    .set('Cookie', 'vcm_session=forged-token-value');
  assert.equal(forged.status, 401);
});

test('/me returns the current user; logout revokes the session server-side', async (t) => {
  const { app, createUser } = await setup(t);
  await createUser({ email: EMAIL, fullName: 'Roshan Srimal' });
  const agent = request.agent(app);
  const csrf = await signIn(agent, EMAIL);

  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.data.user.fullName, 'Roshan Srimal');
  assert.equal(me.body.data.csrfToken, csrf);
  assert.deepEqual(me.body.data.roles, ['EMPLOYEE']);

  const logout = await agent
    .post('/api/auth/logout')
    .set('Origin', TEST_ORIGIN)
    .set('X-CSRF-Token', csrf);
  assert.equal(logout.status, 200);

  // Replaying the old cookie must fail even if the browser kept it.
  const after = await agent.get('/api/auth/me');
  assert.equal(after.status, 401);
});

test('state-changing requests require a valid CSRF token', async (t) => {
  const { app, createUser } = await setup(t);
  await createUser({ email: EMAIL });
  const agent = request.agent(app);
  await signIn(agent, EMAIL);

  const noToken = await agent
    .post('/api/auth/logout')
    .set('Origin', TEST_ORIGIN);
  assert.equal(noToken.status, 403);
  assert.equal(noToken.body.error.code, 'CSRF_TOKEN_INVALID');

  const badToken = await agent
    .post('/api/auth/logout')
    .set('X-CSRF-Token', 'wrong');
  assert.equal(badToken.status, 403);
});

test('cross-origin and non-JSON writes are rejected before authentication', async (t) => {
  const { app, createUser } = await setup(t);
  await createUser({ email: EMAIL });

  const crossOrigin = await request(app)
    .post('/api/auth/login')
    .set('Origin', 'https://evil.example')
    .send({ email: EMAIL, password: DEFAULT_PASSWORD });
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOrigin.body.error.code, 'ORIGIN_NOT_ALLOWED');

  const crossSite = await request(app)
    .post('/api/auth/login')
    .set('Sec-Fetch-Site', 'cross-site')
    .send({ email: EMAIL, password: DEFAULT_PASSWORD });
  assert.equal(crossSite.status, 403);

  const formPost = await request(app)
    .post('/api/auth/login')
    .type('form')
    .send(`email=${EMAIL}&password=${DEFAULT_PASSWORD}`);
  assert.equal(formPost.status, 415);
});

test('session management lists sessions without tokens and revokes others', async (t) => {
  const { app, createUser } = await setup(t);
  await createUser({ email: EMAIL });
  const laptop = request.agent(app);
  const phone = request.agent(app);
  const csrf = await signIn(laptop, EMAIL);
  await signIn(phone, EMAIL);

  const list = await laptop.get('/api/auth/sessions');
  assert.equal(list.status, 200);
  const { sessions } = list.body.data;
  assert.equal(sessions.length, 2);
  assert.equal(sessions.filter((s) => s.current).length, 1);
  assert.ok(sessions.every((s) => s.status === 'ACTIVE'));
  const serialized = JSON.stringify(list.body);
  assert.ok(
    !serialized.includes('token_hash') && !serialized.includes('tokenHash'),
  );

  const revoke = await laptop
    .post('/api/auth/sessions/revoke-others')
    .set('X-CSRF-Token', csrf);
  assert.equal(revoke.status, 200);
  assert.equal(revoke.body.data.revokedSessions, 1);

  assert.equal((await phone.get('/api/auth/me')).status, 401);
  assert.equal((await laptop.get('/api/auth/me')).status, 200);
});

test('users can only revoke their own sessions', async (t) => {
  const { app, db, createUser } = await setup(t);
  await createUser({ email: EMAIL });
  await createUser({ email: 'other@valuecraftminds.com' });
  const mine = request.agent(app);
  const theirs = request.agent(app);
  const csrf = await signIn(mine, EMAIL);
  await signIn(theirs, 'other@valuecraftminds.com');

  const { rows } = await db.query(
    `SELECT s.id FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = 'other@valuecraftminds.com'`,
  );
  const res = await mine
    .delete(`/api/auth/sessions/${rows[0].id}`)
    .set('X-CSRF-Token', csrf);
  assert.equal(res.status, 404);
  assert.equal((await theirs.get('/api/auth/me')).status, 200);

  const invalid = await mine
    .delete('/api/auth/sessions/not-a-uuid')
    .set('X-CSRF-Token', csrf);
  assert.equal(invalid.status, 422);
});

test('changing password verifies the current one and ends other sessions', async (t) => {
  const { app, db, createUser } = await setup(t);
  await createUser({ email: EMAIL });
  const main = request.agent(app);
  const other = request.agent(app);
  const csrf = await signIn(main, EMAIL);
  await signIn(other, EMAIL);
  const newPassword = 'An0ther-Str0ng-Passphrase!';

  const wrong = await main
    .post('/api/auth/password')
    .set('X-CSRF-Token', csrf)
    .send({ currentPassword: 'incorrect-password', newPassword });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error.code, 'INVALID_CURRENT_PASSWORD');

  const weak = await main
    .post('/api/auth/password')
    .set('X-CSRF-Token', csrf)
    .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'short' });
  assert.equal(weak.status, 422);

  const ok = await main
    .post('/api/auth/password')
    .set('X-CSRF-Token', csrf)
    .send({ currentPassword: DEFAULT_PASSWORD, newPassword });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.revokedSessions, 1);
  assert.equal((await other.get('/api/auth/me')).status, 401);
  assert.equal((await main.get('/api/auth/me')).status, 200);

  const relogin = await request(app)
    .post('/api/auth/login')
    .send({ email: EMAIL, password: newPassword });
  assert.equal(relogin.status, 200);

  const audit = JSON.stringify(await auditActions(db));
  assert.ok(!audit.includes(newPassword));
  assert.ok(!audit.includes(DEFAULT_PASSWORD));
});

test('disabling a user ends their active sessions on the next request', async (t) => {
  const { app, db, createUser } = await setup(t);
  const user = await createUser({ email: EMAIL });
  const agent = request.agent(app);
  await signIn(agent, EMAIL);
  await db.query(`UPDATE users SET status = 'SUSPENDED' WHERE id = $1`, [
    user.id,
  ]);

  assert.equal((await agent.get('/api/auth/me')).status, 401);
  const { rows } = await db.query(
    'SELECT revoke_reason FROM sessions WHERE user_id = $1',
    [user.id],
  );
  assert.equal(rows[0].revoke_reason, 'ACCOUNT_DISABLED');
});

test('idle sessions expire', async (t) => {
  const { app, db, createUser } = await setup(t, {
    SESSION_IDLE_MINUTES: '30',
  });
  await createUser({ email: EMAIL });
  const agent = request.agent(app);
  await signIn(agent, EMAIL);
  await db.query(
    `UPDATE sessions SET last_seen_at = now() - interval '31 minutes'`,
  );
  assert.equal((await agent.get('/api/auth/me')).status, 401);
});

test('unknown endpoints and malformed JSON return safe errors', async (t) => {
  const { app } = await setup(t);
  const missing = await request(app).get('/api/does-not-exist');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');

  const malformed = await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"email":');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON');
  assert.ok(!JSON.stringify(malformed.body).includes('at '));
});
