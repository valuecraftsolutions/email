import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { HostingerMailProvider } from '../src/services/mail/HostingerMailProvider.js';
import { createTestApp, signIn, TEST_ORIGIN } from './helpers/testApp.js';
import { createFakeImapServer } from './helpers/fakeImap.js';

const EMAIL = 'employee@valuecraftminds.com';
const MAILBOX_PASSWORD = 'correct-mailbox-password';

/** Real HostingerMailProvider wired to an in-memory IMAP/SMTP fake. */
function fakeFactory() {
  const server = createFakeImapServer({ validPassword: MAILBOX_PASSWORD });
  const created = [];
  return {
    server,
    created,
    create(providerId, { mailbox, credentials }) {
      created.push({ providerId, mailbox, credentials });
      return new HostingerMailProvider({
        mailbox,
        credentials,
        config: { ...factoryConfig },
        createImapClient: server.createImapClient,
        createTransport: server.createTransport,
      });
    },
    evict() {},
    close() {},
  };
}
let factoryConfig;

async function setup(t, { connect = true, overrides } = {}) {
  const factory = fakeFactory();
  const ctx = await createTestApp(overrides, { mailProviderFactory: factory });
  factoryConfig = ctx.config.mail;
  t.after(() => ctx.close());
  await ctx.createUser({ email: EMAIL, fullName: 'Nimal Perera' });
  const agent = request.agent(ctx.app);
  const csrf = await signIn(agent, EMAIL);
  const post = (path, body) =>
    agent
      .post(path)
      .set('Origin', TEST_ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send(body);
  if (connect) {
    const res = await post('/api/mailboxes/me/connect', {
      password: MAILBOX_PASSWORD,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  return { ...ctx, factory, agent, csrf, post };
}

test('mail endpoints require a connected mailbox', async (t) => {
  const { agent } = await setup(t, { connect: false });
  const res = await agent.get('/api/mail/folders');
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'MAILBOX_NOT_CONNECTED');
});

test('connecting verifies the password and stores it only encrypted', async (t) => {
  const { post, agent, db } = await setup(t, { connect: false });

  const wrong = await post('/api/mailboxes/me/connect', { password: 'nope' });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error.code, 'MAILBOX_AUTH_FAILED');
  assert.equal(
    (await db.query('SELECT count(*)::int n FROM mailboxes')).rows[0].n,
    0,
  );

  const ok = await post('/api/mailboxes/me/connect', {
    password: MAILBOX_PASSWORD,
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.mailbox.emailAddress, EMAIL);
  assert.equal(ok.body.data.mailbox.connectionStatus, 'CONNECTED');
  assert.equal(ok.body.data.mailbox.isPrimary, true);

  const { rows } = await db.query(
    'SELECT credentials_encrypted FROM mailboxes',
  );
  assert.match(rows[0].credentials_encrypted, /^v1:k1:/);
  assert.ok(!rows[0].credentials_encrypted.includes(MAILBOX_PASSWORD));

  const mine = await agent.get('/api/mailboxes/me');
  const serialized = JSON.stringify(mine.body);
  assert.ok(!serialized.includes(MAILBOX_PASSWORD));
  assert.ok(
    !serialized.includes('credentials_encrypted') &&
      !serialized.includes('v1:k1'),
  );

  const audit = JSON.stringify(
    (await db.query('SELECT action, metadata FROM audit_logs')).rows,
  );
  assert.match(audit, /mailbox\.mapping_changed/);
  assert.match(audit, /mailbox\.connect_failed/);
  assert.ok(!audit.includes(MAILBOX_PASSWORD) && !audit.includes('"nope"'));
});

test('only company-domain mailboxes that are not owned by someone else can be connected', async (t) => {
  const ctx = await setup(t, { connect: false });
  await ctx.createUser({ email: 'outsider@gmail.com' });
  const outsider = request.agent(ctx.app);
  const csrf = await signIn(outsider, 'outsider@gmail.com');
  const res = await outsider
    .post('/api/mailboxes/me/connect')
    .set('X-CSRF-Token', csrf)
    .send({ password: MAILBOX_PASSWORD });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'MAILBOX_DOMAIN_NOT_ALLOWED');

  // A mailbox already owned by another user cannot be taken over.
  const other = await ctx.createUser({ email: 'owner@valuecraftminds.com' });
  const { rows } = await ctx.db.query(
    `INSERT INTO mailboxes (email_address) VALUES ($1) RETURNING id`,
    [EMAIL],
  );
  await ctx.db.query(
    `INSERT INTO user_mailboxes (user_id, mailbox_id, access_level) VALUES ($1, $2, 'OWNER')`,
    [other.id, rows[0].id],
  );
  const takeover = await ctx.post('/api/mailboxes/me/connect', {
    password: MAILBOX_PASSWORD,
  });
  assert.equal(takeover.status, 409);
  assert.equal(takeover.body.error.code, 'MAILBOX_ASSIGNED_TO_OTHER_USER');
});

test('folders, message list and search work through the provider', async (t) => {
  const { agent, factory } = await setup(t);
  const folders = await agent.get('/api/mail/folders');
  assert.equal(folders.status, 200);
  assert.ok(folders.body.data.folders.some((f) => f.role === 'sent'));
  // The provider received the decrypted credentials; the browser never did.
  assert.equal(factory.created.at(-1).credentials.password, MAILBOX_PASSWORD);

  const list = await agent.get('/api/mail/messages?folder=inbox&pageSize=2');
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.body.data.messages.map((m) => m.uid),
    [103, 102],
  );

  const sent = await agent.get('/api/mail/messages?folder=sent');
  assert.equal(sent.status, 200);
  assert.equal(sent.body.data.folder, 'INBOX.Sent');

  const search = await agent.get(
    '/api/mail/search?q=report&unread=true&since=2026-09-01',
  );
  assert.equal(search.status, 200);
  assert.equal(search.body.data.total, 2);

  const bad = await agent.get('/api/mail/search?since=yesterday');
  assert.equal(bad.status, 422);

  const missing = await agent.get('/api/mail/messages?folder=DoesNotExist');
  assert.equal(missing.status, 404);
});

test('message HTML is sanitized and marking read is explicit', async (t) => {
  const { agent, factory } = await setup(t);
  const res = await agent.get(
    '/api/mail/messages/103?folder=INBOX&markRead=true',
  );
  assert.equal(res.status, 200);
  const { message } = res.body.data;
  assert.doesNotMatch(message.html, /<script|onclick/);
  assert.doesNotMatch(message.html, /(?<!-)src="https:\/\/tracker/);
  assert.equal(message.blockedImages, 1);
  assert.equal(message.unread, false);
  assert.ok(
    factory.server.calls.some((c) => c[0] === 'flagsAdd' && c[1] === '103'),
  );

  const images = await agent.get(
    '/api/mail/messages/103?folder=INBOX&images=true',
  );
  assert.match(images.body.data.message.html, /src="https:\/\/tracker/);
});

test('attachments download as attachments with safe headers', async (t) => {
  const { agent } = await setup(t);
  const res = await agent
    .get('/api/mail/messages/103/attachments/2?folder=INBOX')
    .buffer(true);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/pdf');
  assert.match(
    res.headers['content-disposition'],
    /^attachment; filename="report\.pdf"/,
  );
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.headers['content-security-policy'], /sandbox/);

  const traversal = await agent.get(
    '/api/mail/messages/103/attachments/..%2F1?folder=INBOX',
  );
  assert.equal(traversal.status, 422);
});

test('flags, move and delete require CSRF and validate input', async (t) => {
  const { agent, post } = await setup(t);
  const noCsrf = await agent
    .post('/api/mail/messages/flags')
    .send({ uids: [101], seen: true });
  assert.equal(noCsrf.status, 403);

  assert.equal(
    (await post('/api/mail/messages/flags', { uids: [101], seen: true }))
      .status,
    200,
  );
  assert.equal(
    (await post('/api/mail/messages/flags', { uids: [101] })).status,
    422,
  );
  assert.equal(
    (await post('/api/mail/messages/flags', { uids: [], seen: true })).status,
    422,
  );

  const moved = await post('/api/mail/messages/move', {
    folder: 'INBOX',
    uids: [101],
    destination: 'Projects',
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.data.moved, 1);

  const deleted = await post('/api/mail/messages/delete', {
    folder: 'INBOX',
    uids: [102],
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.movedTo, 'INBOX.Trash');
});

test('sending validates recipients, blocks duplicates and is audited without content', async (t) => {
  const { post, db, factory } = await setup(t);
  const clientRequestId = '7d5a3c8e-4b1f-4e5a-9c2d-1f0e2d3c4b5a';
  const message = {
    to: ['client@example.com'],
    bcc: ['boss@valuecraftminds.com'],
    subject: 'Proposal',
    html: '<p>Hello<script>alert(1)</script></p>',
    clientRequestId,
  };
  const res = await post('/api/mail/send', message);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.savedToSent, true);

  const { raw } = factory.server.sent[0];
  assert.match(raw, /^From: Nimal Perera <employee@valuecraftminds\.com>/m);
  assert.doesNotMatch(raw, /<script/);
  assert.doesNotMatch(raw, /^Bcc:/im);

  const duplicate = await post('/api/mail/send', message);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'DUPLICATE_SUBMISSION');
  assert.equal(factory.server.sent.length, 1);

  const invalid = await post('/api/mail/send', {
    to: ['not-an-email'],
    subject: 'x',
  });
  assert.equal(invalid.status, 422);
  const noRecipients = await post('/api/mail/send', { to: [], subject: 'x' });
  assert.equal(noRecipients.status, 422);
  const injection = await post('/api/mail/send', {
    to: ['a@example.com'],
    subject: 'Hi\r\nBcc: victim@example.com',
  });
  assert.equal(injection.status, 422);

  const audit = (
    await db.query(`SELECT metadata FROM audit_logs WHERE action = 'mail.sent'`)
  ).rows;
  assert.equal(audit.length, 1);
  assert.deepEqual(audit[0].metadata, {
    recipients: 2,
    attachments: 0,
    reply: false,
  });
});

test('recipient limit and send permission are enforced', async (t) => {
  const { post, db } = await setup(t, {
    overrides: { MAIL_MAX_RECIPIENTS: '2' },
  });
  const many = await post('/api/mail/send', {
    to: ['a@x.com', 'b@x.com', 'c@x.com'],
  });
  assert.equal(many.status, 422);
  assert.equal(many.body.error.code, 'TOO_MANY_RECIPIENTS');

  await db.query(
    `DELETE FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE code = 'EMPLOYEE')
       AND permission_id = (SELECT id FROM permissions WHERE code = 'mail.send')`,
  );
  const denied = await post('/api/mail/send', { to: ['a@x.com'] });
  assert.equal(denied.status, 403);
});

test('large HTML bodies are accepted only on compose endpoints', async (t) => {
  const { post } = await setup(t);
  const html = `<p>${'x'.repeat(300_000)}</p>`;
  const send = await post('/api/mail/drafts', { to: [], subject: 'Big', html });
  assert.equal(send.status, 201);
  const elsewhere = await post('/api/mail/messages/flags', {
    uids: [1],
    seen: true,
    pad: html,
  });
  assert.equal(elsewhere.status, 413);
});

test('a rejected stored password marks the mailbox FAILED and asks to reconnect', async (t) => {
  const { agent, db } = await setup(t);
  const { rows } = await db.query('SELECT id FROM mailboxes');
  // Simulate the password having been changed at Hostinger.
  await db.query(
    `UPDATE mailboxes SET credentials_encrypted = $1 WHERE id = $2`,
    [
      (await import('../src/services/security/encryptionService.js'))
        .createEncryptionService({ key: Buffer.alloc(32, 7), keyId: 'k1' })
        .encrypt(
          JSON.stringify({ username: EMAIL, password: 'old-password' }),
          `mailbox:${rows[0].id}`,
        ),
      rows[0].id,
    ],
  );
  const res = await agent.get('/api/mail/folders');
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'MAILBOX_CREDENTIALS_INVALID');
  const status = await db.query(
    'SELECT connection_status, last_error_code FROM mailboxes',
  );
  assert.deepEqual(status.rows[0], {
    connection_status: 'FAILED',
    last_error_code: 'AUTH_FAILED',
  });
});

test('tampered credential ciphertext is rejected, not used', async (t) => {
  const { agent, db } = await setup(t);
  const { rows } = await db.query(
    'SELECT id, credentials_encrypted FROM mailboxes',
  );
  const parts = rows[0].credentials_encrypted.split(':');
  parts[3] = Buffer.alloc(16, 1).toString('base64url'); // forged GCM auth tag
  await db.query(
    'UPDATE mailboxes SET credentials_encrypted = $1 WHERE id = $2',
    [parts.join(':'), rows[0].id],
  );
  const res = await agent.get('/api/mail/folders');
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'MAILBOX_CREDENTIALS_INVALID');
});

test('disconnecting removes stored credentials', async (t) => {
  const { agent, csrf, db } = await setup(t);
  const res = await agent.delete('/api/mailboxes/me').set('X-CSRF-Token', csrf);
  assert.equal(res.status, 200);
  const { rows } = await db.query(
    'SELECT credentials_encrypted FROM mailboxes',
  );
  assert.equal(rows[0].credentials_encrypted, null);
  assert.equal((await agent.get('/api/mail/folders')).status, 409);
});
