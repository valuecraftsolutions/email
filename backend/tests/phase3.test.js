import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  prepareAttachments,
  safeFilename,
} from '../src/services/mail/attachmentPolicy.js';
import { HostingerMailProvider } from '../src/services/mail/HostingerMailProvider.js';
import { decodeFragment, toPreview } from '../src/services/mail/preview.js';
import { createTestApp, signIn, TEST_ORIGIN } from './helpers/testApp.js';
import { createFakeImapServer } from './helpers/fakeImap.js';

const EMAIL = 'employee@valuecraftminds.com';
const MAILBOX_PASSWORD = 'correct-mailbox-password';

// ------------------------------------------------------------------ previews

test('decodes truncated base64 and quoted-printable fragments safely', () => {
  const b64 = Buffer.from(
    Buffer.from('Hello wörld, this is long').toString('base64'),
  );
  // 11 chars -> only 8 complete base64 chars (6 bytes); 12 chars end right after "ö".
  assert.equal(
    decodeFragment(b64.subarray(0, 11), {
      encoding: 'base64',
      charset: 'utf-8',
    }),
    'Hello ',
  );
  assert.equal(
    decodeFragment(b64.subarray(0, 12), {
      encoding: 'base64',
      charset: 'utf-8',
    }),
    'Hello wö',
  );
  // A cut inside a multi-byte character is dropped instead of showing "�".
  assert.equal(
    decodeFragment(Buffer.from([0x48, 0x69, 0xc3]), { charset: 'utf-8' }),
    'Hi',
  );
  assert.equal(
    decodeFragment(Buffer.from('Caf=C3=A9 and =E2=82=AC =C3'), {
      encoding: 'quoted-printable',
      charset: 'utf-8',
    }),
    'Café and € ',
  );
  assert.equal(
    decodeFragment(Buffer.from([0x43, 0x61, 0x66, 0xe9]), {
      encoding: '8bit',
      charset: 'iso-8859-1',
    }),
    'Café',
  );
});

test('builds a clean one-line preview from text or HTML', () => {
  assert.equal(
    toPreview('Hi team,\r\n\r\nSee below.\r\n> old quoted text\r\nThanks'),
    'Hi team, See below. Thanks',
  );
  assert.equal(
    toPreview(
      '<html><head><style>p{color:red}</style><title>T</title></head><body><p>Hello&nbsp;&amp; welcome &#8364;</p><!-- c --></body>',
      { html: true },
    ),
    'Hello & welcome €',
  );
  assert.equal(
    toPreview('<head><style>very long unterminated', { html: true }),
    '',
  );
  const long = toPreview('x '.repeat(500));
  assert.ok(long.length <= 180 && long.endsWith('…'));
});

// -------------------------------------------------------------- attachments

const policy = {
  maxAttachments: 3,
  maxAttachmentBytes: 1024,
  blockedExtensions: ['exe', 'js', 'bat'],
};

test('filenames cannot carry paths or control characters', () => {
  assert.equal(safeFilename('../../etc/passwd'), 'passwd');
  assert.equal(safeFilename('..\\..\\Windows\\evil.txt'), 'evil.txt');
  assert.equal(safeFilename('a\r\nb"c.pdf'), 'a__b_c.pdf');
  assert.equal(safeFilename('...hidden'), 'hidden');
  assert.equal(safeFilename(''), 'attachment');
  assert.ok(safeFilename(`${'n'.repeat(300)}.pdf`).endsWith('.pdf'));
  assert.ok(safeFilename(`${'n'.repeat(300)}.pdf`).length <= 200);
});

test('attachment policy blocks executables, limits count and size, and derives type', () => {
  const file = (name, size = 10) => ({
    originalname: name,
    buffer: Buffer.alloc(size, 1),
  });
  const [ok] = prepareAttachments({ uploads: [file('Report.PDF')], policy });
  assert.equal(ok.contentType, 'application/pdf');
  assert.throws(
    () => prepareAttachments({ uploads: [file('invoice.pdf.exe')], policy }),
    (e) => e.code === 'ATTACHMENT_TYPE_BLOCKED',
  );
  assert.throws(
    () => prepareAttachments({ uploads: [file('a.JS')], policy }),
    (e) => e.code === 'ATTACHMENT_TYPE_BLOCKED',
  );
  assert.throws(
    () =>
      prepareAttachments({
        uploads: [file('a'), file('b'), file('c'), file('d')],
        policy,
      }),
    (e) => e.code === 'TOO_MANY_ATTACHMENTS',
  );
  assert.throws(
    () =>
      prepareAttachments({ uploads: [file('a', 600), file('b', 600)], policy }),
    (e) => e.status === 413,
  );
  assert.throws(
    () => prepareAttachments({ uploads: [file('empty.txt', 0)], policy }),
    (e) => e.code === 'ATTACHMENT_EMPTY',
  );
});

// ------------------------------------------------------------ API features

function fakeFactory() {
  const server = createFakeImapServer({ validPassword: MAILBOX_PASSWORD });
  let config;
  return {
    server,
    setConfig: (c) => (config = c),
    create: (id, { mailbox, credentials }) =>
      new HostingerMailProvider({
        mailbox,
        credentials,
        config,
        createImapClient: server.createImapClient,
        createTransport: server.createTransport,
      }),
    evict() {},
    close() {},
  };
}

async function setup(t, overrides) {
  const factory = fakeFactory();
  const ctx = await createTestApp(overrides, { mailProviderFactory: factory });
  factory.setConfig(ctx.config.mail);
  t.after(() => ctx.close());
  await ctx.createUser({ email: EMAIL, fullName: 'Nimal Perera' });
  const agent = request.agent(ctx.app);
  const csrf = await signIn(agent, EMAIL);
  const post = (path) =>
    agent.post(path).set('Origin', TEST_ORIGIN).set('X-CSRF-Token', csrf);
  assert.equal(
    (
      await post('/api/mailboxes/me/connect').send({
        password: MAILBOX_PASSWORD,
      })
    ).status,
    200,
  );
  return { ...ctx, factory, agent, post };
}

test('message list includes decoded previews', async (t) => {
  const { agent } = await setup(t);
  const res = await agent.get('/api/mail/messages?folder=inbox');
  const byUid = Object.fromEntries(
    res.body.data.messages.map((m) => [m.uid, m.preview]),
  );
  assert.equal(byUid[103], 'Café plain body');
  assert.equal(byUid[102], 'Body of 102');
});

test('starred is a flagged-messages view over the inbox', async (t) => {
  const { agent, factory } = await setup(t);
  const res = await agent.get('/api/mail/messages?folder=starred');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.view, 'starred');
  assert.equal(res.body.data.folder, 'INBOX');
  const search = factory.server.calls.find((c) => c[0] === 'search');
  assert.equal(search[1].flagged, true);
});

test('inline cid images are linked to same-origin attachment URLs', async (t) => {
  const { agent } = await setup(t);
  const res = await agent.get('/api/mail/messages/103?folder=INBOX');
  const { message } = res.body.data;
  assert.match(
    message.html,
    /src="\/api\/mail\/messages\/103\/attachments\/3\?folder=INBOX"/,
  );
  assert.doesNotMatch(message.html, /cid:/);
  const logo = message.attachments.find((a) => a.partId === '3');
  assert.equal(logo.embedded, true);
  assert.equal(
    message.attachments.find((a) => a.partId === '2').embedded,
    false,
  );
});

test('multipart send attaches uploads with server-derived types', async (t) => {
  const { post, factory } = await setup(t);
  const res = await post('/api/mail/send')
    .field(
      'message',
      JSON.stringify({
        to: ['client@example.com'],
        subject: 'Files',
        text: 'See attached',
      }),
    )
    .attach('attachments', Buffer.from('meeting notes'), {
      filename: '../../notes.txt',
      contentType: 'application/x-msdownload',
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { raw } = factory.server.sent[0];
  assert.match(raw, /Content-Type: text\/plain; name=notes\.txt/);
  assert.match(raw, /filename=notes\.txt/);
  assert.doesNotMatch(raw, /\.\.\//);
});

test('blocked and oversized uploads are rejected before sending', async (t) => {
  const { post, factory } = await setup(t, { MAIL_MAX_ATTACHMENT_MB: '1' });
  const blocked = await post('/api/mail/send')
    .field('message', JSON.stringify({ to: ['a@example.com'], subject: 'x' }))
    .attach('attachments', Buffer.from('MZ'), 'setup.exe');
  assert.equal(blocked.status, 422);
  assert.equal(blocked.body.error.code, 'ATTACHMENT_TYPE_BLOCKED');

  const huge = await post('/api/mail/send')
    .field('message', JSON.stringify({ to: ['a@example.com'], subject: 'x' }))
    .attach('attachments', Buffer.alloc(1024 * 1024 + 10, 1), 'big.bin');
  assert.equal(huge.status, 413);

  const badJson = await post('/api/mail/send').field('message', '{not json');
  assert.equal(badJson.status, 400);
  assert.equal(factory.server.sent.length, 0);
});

test('forwarding copies attachments server-side from the original message', async (t) => {
  const { post, factory } = await setup(t);
  const res = await post('/api/mail/send').send({
    to: ['partner@example.com'],
    subject: 'Fwd: Message 103',
    text: 'FYI',
    includeAttachments: [{ folder: 'INBOX', uid: 103, partId: '2' }],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { raw } = factory.server.sent[0];
  assert.match(raw, /filename=report\.pdf/);
  assert.match(raw, /Content-Type: application\/pdf/);

  const missing = await post('/api/mail/send').send({
    to: ['partner@example.com'],
    includeAttachments: [{ folder: 'INBOX', uid: 103, partId: '9' }],
  });
  assert.equal(missing.status, 404);
});

test('replying marks the original answered and sending a draft removes it', async (t) => {
  const { post, factory } = await setup(t);
  const res = await post('/api/mail/send').send({
    to: ['sender@example.com'],
    subject: 'Re: Message 103',
    text: 'Thanks',
    inReplyTo: '<m103@example.com>',
    references: ['<m103@example.com>'],
    replyTo: { folder: 'INBOX', uid: 103 },
    draftUid: 55,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const calls = factory.server.calls;
  assert.ok(
    calls.some(
      (c) =>
        c[0] === 'flagsAdd' && c[1] === '103' && c[2].includes('\\Answered'),
    ),
  );
  assert.ok(
    calls.some(
      (c) => c[0] === 'delete' && c[1] === 'INBOX.Drafts' && c[2] === '55',
    ),
  );
});

test('drafts accept attachments and replace the previous version', async (t) => {
  const { post, factory } = await setup(t);
  const res = await post('/api/mail/drafts')
    .field(
      'message',
      JSON.stringify({ to: [], subject: 'WIP', replaceUid: 12 }),
    )
    .attach('attachments', Buffer.from('draft data'), 'plan.docx');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const append = factory.server.calls.find((c) => c[0] === 'append');
  assert.equal(append[1], 'INBOX.Drafts');
  assert.match(append[2], /filename=plan\.docx/);
  assert.equal(factory.server.sent.length, 0);
});
