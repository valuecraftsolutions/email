import { Readable } from 'node:stream';

/**
 * Minimal in-memory stand-in for an imapflow client, enough to exercise
 * HostingerMailProvider without a network connection.
 */
export function createFakeImapServer({
  authFails = false,
  validPassword,
} = {}) {
  const rejects = (auth) =>
    authFails || (validPassword !== undefined && auth?.pass !== validPassword);
  const folders = [
    {
      path: 'INBOX',
      name: 'INBOX',
      delimiter: '.',
      specialUse: '\\Inbox',
      messages: 3,
      unseen: 2,
    },
    {
      path: 'INBOX.Sent',
      name: 'Sent',
      delimiter: '.',
      parentPath: 'INBOX',
      specialUse: '\\Sent',
      messages: 0,
      unseen: 0,
    },
    {
      path: 'INBOX.Drafts',
      name: 'Drafts',
      delimiter: '.',
      parentPath: 'INBOX',
      specialUse: '\\Drafts',
      messages: 0,
      unseen: 0,
    },
    {
      path: 'INBOX.Trash',
      name: 'Trash',
      delimiter: '.',
      parentPath: 'INBOX',
      specialUse: '\\Trash',
      messages: 0,
      unseen: 0,
    },
    {
      path: 'INBOX.Junk',
      name: 'Junk',
      delimiter: '.',
      parentPath: 'INBOX',
      specialUse: '\\Junk',
      messages: 0,
      unseen: 0,
    },
    {
      path: 'Projects',
      name: 'Projects',
      delimiter: '.',
      messages: 1,
      unseen: 0,
    },
    {
      path: 'Archive-root',
      name: 'Archive-root',
      delimiter: '.',
      noselect: true,
    },
  ];

  const structure = {
    type: 'multipart/mixed',
    childNodes: [
      {
        part: '1',
        type: 'multipart/alternative',
        childNodes: [
          {
            part: '1.1',
            type: 'text/plain',
            size: 20,
            encoding: 'quoted-printable',
            parameters: { charset: 'utf-8' },
          },
          { part: '1.2', type: 'text/html', size: 60 },
        ],
      },
      {
        part: '2',
        type: 'application/pdf',
        disposition: 'attachment',
        dispositionParameters: { filename: 'report.pdf' },
        size: 1234,
      },
      {
        part: '3',
        type: 'image/png',
        disposition: 'inline',
        dispositionParameters: { filename: 'logo.png' },
        id: '<logo@x>',
        size: 64,
      },
    ],
  };

  const inbox = [101, 102, 103].map((uid, i) => ({
    seq: i + 1,
    uid,
    flags: new Set(uid === 101 ? ['\\Seen'] : []),
    envelope: {
      subject: `Message ${uid}`,
      messageId: `<m${uid}@example.com>`,
      from: [{ name: 'Sender', address: 'Sender@Example.com' }],
      to: [{ address: 'me@valuecraftminds.com' }],
      date: new Date(Date.UTC(2026, 8, i + 1)),
    },
    internalDate: new Date(Date.UTC(2026, 8, i + 1)),
    size: 2048,
    bodyStructure: uid === 103 ? structure : { type: 'text/plain', size: 10 },
    headers: Buffer.from(
      'References: <a@x> <b@x>\r\nReply-To: r@example.com\r\n',
    ),
  }));

  const calls = [];
  const clients = [];

  class FakeClient {
    constructor(options) {
      this.options = options;
      this.usable = false;
      this.mailbox = null;
      clients.push(this);
    }
    on() {}
    async connect() {
      if (rejects(this.options.auth))
        throw Object.assign(new Error('Invalid credentials'), {
          authenticationFailed: true,
        });
      this.usable = true;
    }
    async logout() {
      this.usable = false;
    }
    close() {
      this.usable = false;
    }
    async list(options) {
      calls.push(['list', options]);
      return folders.map((f) => ({
        path: f.path,
        name: f.name,
        delimiter: f.delimiter,
        parentPath: f.parentPath ?? '',
        specialUse: f.specialUse,
        flags: new Set(f.noselect ? ['\\Noselect'] : []),
        status: f.noselect
          ? undefined
          : { messages: f.messages, unseen: f.unseen },
      }));
    }
    async getMailboxLock(path, options) {
      const folder = folders.find((f) => f.path === path && !f.noselect);
      if (!folder)
        throw Object.assign(new Error('Mailbox does not exist'), {
          serverResponseCode: 'NONEXISTENT',
        });
      calls.push(['lock', path, options]);
      this.mailbox = {
        path,
        exists: path === 'INBOX' ? inbox.length : 0,
        uidValidity: 42n,
      };
      return { release: () => calls.push(['release', path]) };
    }
    async fetchAll(range, query, options) {
      calls.push(['fetchAll', range, options]);
      if (query.bodyParts) {
        const { key, maxLength } = query.bodyParts[0];
        const set = new Set(range.split(',').map(Number));
        const body = (uid) =>
          uid === 103
            ? 'Caf=C3=A9 plain body'
            : `Body of ${uid}\r\n> quoted reply line`;
        return inbox
          .filter((m) => set.has(m.uid))
          .map((m) => ({
            uid: m.uid,
            bodyParts: new Map([
              [key, Buffer.from(body(m.uid)).subarray(0, maxLength)],
            ]),
          }));
      }
      if (options?.uid) {
        const set = new Set(range.split(',').map(Number));
        return inbox.filter((m) => set.has(m.uid));
      }
      const [start, end] = range.split(':').map(Number);
      return inbox.filter((m) => m.seq >= start && m.seq <= end);
    }
    async fetchOne(uid) {
      return inbox.find((m) => String(m.uid) === uid) ?? false;
    }
    async download(uid, part) {
      calls.push(['download', uid, part]);
      const bodies = {
        1.1: 'Plain body',
        1.2: '<p onclick="x()">Hello<script>alert(1)</script><img src="https://tracker.example/p.gif"><img src="cid:logo@x"></p>',
        2: '%PDF-1.4 fake',
        3: 'PNGDATA',
      };
      const body = bodies[part];
      return body
        ? { meta: {}, content: Readable.from([Buffer.from(body)]) }
        : {};
    }
    async search(query, options) {
      calls.push(['search', query, options]);
      return [101, 103];
    }
    async messageFlagsAdd(range, flags, options) {
      calls.push(['flagsAdd', range, flags, options]);
      return true;
    }
    async messageFlagsRemove(range, flags, options) {
      calls.push(['flagsRemove', range, flags, options]);
      return true;
    }
    async messageMove(range, destination, options) {
      calls.push(['move', this.mailbox.path, range, destination, options]);
      return { destination };
    }
    async messageDelete(range, options) {
      calls.push(['delete', this.mailbox.path, range, options]);
      return true;
    }
    async append(path, content, flags) {
      calls.push(['append', path, content.toString(), flags]);
      return { destination: path, uid: 900 };
    }
  }

  const sent = [];
  let transportAuth = null;
  const transport = {
    verified: 0,
    async verify() {
      if (rejects(transportAuth))
        throw Object.assign(new Error('535 auth'), { code: 'EAUTH' });
      this.verified += 1;
      return true;
    },
    async sendMail(mail) {
      sent.push({ envelope: mail.envelope, raw: mail.raw.toString() });
      return { accepted: mail.envelope.to, rejected: [] };
    },
    close() {},
  };

  return {
    calls,
    clients,
    sent,
    transport,
    createImapClient: (options) => new FakeClient(options),
    createTransport: (options) => {
      transportAuth = options.auth;
      return transport;
    },
  };
}
