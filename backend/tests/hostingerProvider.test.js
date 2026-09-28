import test from 'node:test';
import assert from 'node:assert/strict';
import { HostingerMailProvider } from '../src/services/mail/HostingerMailProvider.js';
import {
  MAIL_ERROR,
  MailProviderError,
} from '../src/services/mail/MailProvider.js';
import { createImapPool } from '../src/services/mail/imapPool.js';
import { createTestConfig } from './helpers/testApp.js';
import { createFakeImapServer } from './helpers/fakeImap.js';

const mailConfig = createTestConfig().mail;

function setup(options) {
  const server = createFakeImapServer(options);
  const provider = new HostingerMailProvider({
    mailbox: { id: 'mbx-1', emailAddress: 'me@valuecraftminds.com' },
    credentials: {
      username: 'me@valuecraftminds.com',
      password: 'secret-pass',
    },
    config: mailConfig,
    createImapClient: server.createImapClient,
    createTransport: server.createTransport,
  });
  return { server, provider };
}

test('uses Hostinger IMAP/SMTP defaults over TLS', () => {
  assert.deepEqual(mailConfig.imap, {
    host: 'imap.hostinger.com',
    port: 993,
    secure: true,
  });
  assert.deepEqual(mailConfig.smtp, {
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
  });
});

test('lists selectable folders with roles and counts', async () => {
  const { provider, server } = setup();
  const folders = await provider.listFolders();
  assert.deepEqual(
    folders.map((f) => [f.path, f.role]),
    [
      ['INBOX', 'inbox'],
      ['INBOX.Sent', 'sent'],
      ['INBOX.Drafts', 'drafts'],
      ['INBOX.Trash', 'trash'],
      ['INBOX.Junk', 'spam'],
      ['Projects', null],
    ],
  );
  assert.equal(folders[0].unread, 2);
  assert.equal(folders[0].total, 3);
  assert.equal(server.clients[0].options.auth.user, 'me@valuecraftminds.com');
  assert.equal(server.clients[0].options.logger, false);
});

test('pages messages newest first', async () => {
  const { provider, server } = setup();
  const first = await provider.listMessages('INBOX', { page: 1, pageSize: 2 });
  assert.equal(first.total, 3);
  assert.equal(first.uidValidity, '42');
  assert.deepEqual(
    first.messages.map((m) => m.uid),
    [103, 102],
  );
  assert.ok(server.calls.some((c) => c[0] === 'fetchAll' && c[1] === '2:3'));
  const second = await provider.listMessages('INBOX', { page: 2, pageSize: 2 });
  assert.deepEqual(
    second.messages.map((m) => m.uid),
    [101],
  );
  const beyond = await provider.listMessages('INBOX', { page: 3, pageSize: 2 });
  assert.deepEqual(beyond.messages, []);

  const [latest] = first.messages;
  assert.equal(latest.unread, true);
  assert.equal(latest.hasAttachments, true);
  assert.equal(latest.from.address, 'sender@example.com');
  assert.equal(second.messages[0].unread, false);
  // Listing never selects the folder read-write.
  assert.ok(
    server.calls.filter((c) => c[0] === 'lock').every((c) => c[2]?.readOnly),
  );
});

test('reads a message body, headers and attachment metadata', async () => {
  const { provider } = setup();
  const message = await provider.getMessage('INBOX', 103);
  assert.equal(message.text, 'Plain body');
  assert.match(message.html, /Hello/);
  assert.deepEqual(message.references, ['<a@x>', '<b@x>']);
  assert.equal(message.replyTo, 'r@example.com');
  assert.deepEqual(
    message.attachments.map((a) => [a.partId, a.filename, a.contentType]),
    [
      ['2', 'report.pdf', 'application/pdf'],
      ['3', 'logo.png', 'image/png'],
    ],
  );
  await assert.rejects(
    provider.getMessage('INBOX', 999),
    (e) => e.code === MAIL_ERROR.NOT_FOUND,
  );
});

test('downloads attachments by validated part id only', async () => {
  const { provider } = setup();
  const file = await provider.getAttachment('INBOX', 103, '2');
  assert.equal(file.filename, 'report.pdf');
  assert.equal(file.content.toString(), '%PDF-1.4 fake');
  for (const bad of ['../1', '1;DROP', '1.1'])
    // 1.1 is body text, not an attachment
    await assert.rejects(
      provider.getAttachment('INBOX', 103, bad),
      (e) => e.code === MAIL_ERROR.NOT_FOUND,
    );
});

test('flags, moves and deletes by UID', async () => {
  const { provider, server } = setup();
  await provider.setFlags('INBOX', [101, 102], { seen: true, flagged: false });
  assert.deepEqual(
    server.calls
      .filter((c) => c[0].startsWith('flags'))
      .map((c) => c.slice(0, 4)),
    [
      ['flagsAdd', '101,102', ['\\Seen'], { uid: true }],
      ['flagsRemove', '101,102', ['\\Flagged'], { uid: true }],
    ],
  );

  const moved = await provider.deleteMessage('INBOX', [101]);
  assert.deepEqual(moved, {
    deleted: 1,
    permanent: false,
    movedTo: 'INBOX.Trash',
  });
  assert.ok(
    server.calls.some((c) => c[0] === 'move' && c[3] === 'INBOX.Trash'),
  );

  const purged = await provider.deleteMessage('INBOX.Trash', [5]);
  assert.equal(purged.permanent, true);
  assert.ok(
    server.calls.some((c) => c[0] === 'delete' && c[1] === 'INBOX.Trash'),
  );

  await assert.rejects(
    provider.moveMessage('INBOX', [101], 'Nope'),
    (e) => e.code === MAIL_ERROR.NOT_FOUND,
  );
  await assert.rejects(provider.setFlags('INBOX', [0], { seen: true }));
  await assert.rejects(
    provider.listMessages('Missing'),
    (e) => e.code === MAIL_ERROR.NOT_FOUND,
  );
});

test('search maps criteria to IMAP and pages results', async () => {
  const { provider, server } = setup();
  const result = await provider.searchMessages(
    'INBOX',
    {
      text: 'invoice',
      from: 'a@b.com',
      unread: true,
      since: new Date('2026-09-01'),
    },
    { page: 1, pageSize: 10 },
  );
  const [, query, options] = server.calls.find((c) => c[0] === 'search');
  assert.equal(query.text, 'invoice');
  assert.equal(query.seen, false);
  assert.equal(options.uid, true);
  assert.deepEqual(
    result.messages.map((m) => m.uid),
    [103, 101],
  );
  assert.equal(result.total, 2);
});

test('sends via SMTP without Bcc headers and stores a Sent copy', async () => {
  const { provider, server } = setup();
  const result = await provider.sendMessage({
    from: { name: 'Roshan Srimal', address: 'me@valuecraftminds.com' },
    to: ['to@example.com'],
    cc: [],
    bcc: ['hidden@example.com'],
    subject: 'Quarterly report',
    text: 'Hello',
    inReplyTo: '<m103@example.com>',
    references: ['<a@x>', '<m103@example.com>'],
  });
  assert.equal(result.savedToSent, true);
  assert.match(result.messageId, /^<[0-9a-f-]+@valuecraftminds\.com>$/);

  const [{ envelope, raw }] = server.sent;
  assert.deepEqual(envelope.to.sort(), [
    'hidden@example.com',
    'to@example.com',
  ]);
  assert.doesNotMatch(raw, /^Bcc:/im);
  assert.match(raw, /^In-Reply-To: <m103@example\.com>/m);
  assert.match(raw, /^References: <a@x> <m103@example\.com>/m);

  const append = server.calls.find((c) => c[0] === 'append');
  assert.equal(append[1], 'INBOX.Sent');
  assert.match(append[2], /^Bcc: hidden@example\.com/m);
  assert.deepEqual(append[3], ['\\Seen']);
});

test('saves drafts to the Drafts folder and replaces the previous draft', async () => {
  const { provider, server } = setup();
  const draft = await provider.saveDraft(
    {
      from: { name: 'Me', address: 'me@valuecraftminds.com' },
      to: [],
      subject: 'Draft',
      text: 'WIP',
    },
    { replaceUid: 77 },
  );
  assert.equal(draft.folder, 'INBOX.Drafts');
  assert.equal(draft.uid, 900);
  const append = server.calls.find((c) => c[0] === 'append');
  assert.deepEqual(append[3], ['\\Draft', '\\Seen']);
  assert.ok(
    server.calls.some(
      (c) => c[0] === 'delete' && c[1] === 'INBOX.Drafts' && c[2] === '77',
    ),
  );
  assert.equal(server.sent.length, 0);
});

test('authentication failures surface as AUTH_FAILED', async () => {
  const { provider } = setup({ authFails: true });
  await assert.rejects(provider.verifyConnection(), (e) => {
    assert.ok(e instanceof MailProviderError);
    assert.equal(e.code, MAIL_ERROR.AUTH_FAILED);
    assert.doesNotMatch(e.message, /secret-pass/);
    return true;
  });
  await assert.rejects(
    provider.listFolders(),
    (e) => e.code === MAIL_ERROR.AUTH_FAILED,
  );
});

test('verifyConnection checks both IMAP and SMTP', async () => {
  const { provider, server } = setup();
  assert.deepEqual(await provider.verifyConnection(), {
    imap: 'ok',
    smtp: 'ok',
  });
  assert.equal(server.transport.verified, 1);
});

test('unimplemented capabilities report NOT_SUPPORTED', async () => {
  const { MailProvider } = await import('../src/services/mail/MailProvider.js');
  const base = new MailProvider();
  await assert.rejects(
    base.listFolders(),
    (e) => e.code === MAIL_ERROR.NOT_SUPPORTED,
  );
  const { provider } = setup();
  assert.equal(provider.capabilities().folderManagement, false);
});

test('IMAP pool reuses one connection per key and evicts on demand', async () => {
  const server = createFakeImapServer();
  const pool = createImapPool({
    createClient: server.createImapClient,
    idleMs: 60_000,
  });
  const a = await pool.use('mbx-1:k', {}, async (client) => client);
  const b = await pool.use('mbx-1:k', {}, async (client) => client);
  assert.equal(a, b);
  assert.equal(pool.size, 1);
  await Promise.all([
    pool.use('mbx-1:k', {}, async () => {}),
    pool.use('mbx-2:k', {}, async () => {}),
  ]);
  assert.equal(pool.size, 2);
  pool.evict('mbx-1:');
  assert.equal(pool.size, 1);
  pool.closeAll();
  assert.equal(pool.size, 0);
});
