import { createHash, randomUUID } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import {
  MAIL_ERROR,
  MailProvider,
  MailProviderError,
  notSupported,
} from './MailProvider.js';
import {
  attachmentsOf,
  bodyParts,
  parseHeaders,
  parseMessageIdList,
  toFolder,
  toMessageSummary,
} from './messageMapper.js';
import { decodeFragment, toPreview } from './preview.js';

const SUMMARY_QUERY = {
  uid: true,
  flags: true,
  envelope: true,
  internalDate: true,
  size: true,
  bodyStructure: true,
};
const MAX_TEXT_PART_BYTES = 2 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const PART_ID = /^\d+(\.\d+)*$/;
// Enough of the first text part for a one-line preview (HTML needs more to get past <head>).
const PREVIEW_BYTES = { text: 1024, html: 8192 };

const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'NoConnection',
  'EConnectionClosed',
  'ClosedAfterConnectText',
  'ClosedAfterConnectTLS',
  'CONNECT_TIMEOUT',
  'GREETING_TIMEOUT',
  'UPGRADE_TIMEOUT',
  'ETIMEOUT',
  'LockTimeout',
  'ECONNECTION',
  'ESOCKET',
  'ETLS',
]);

/** Maps imapflow / nodemailer errors onto provider-neutral codes. */
export function toProviderError(error) {
  if (error instanceof MailProviderError) return error;
  const code = error?.code;
  if (error?.authenticationFailed || code === 'EAUTH')
    return new MailProviderError(
      MAIL_ERROR.AUTH_FAILED,
      'The mail server rejected the mailbox credentials.',
      { cause: error },
    );
  if (code === 'ETHROTTLE')
    return new MailProviderError(
      MAIL_ERROR.RATE_LIMITED,
      'The mail server is throttling requests.',
      { cause: error },
    );
  if (code === 'EENVELOPE')
    return new MailProviderError(
      MAIL_ERROR.RECIPIENT_REJECTED,
      'The mail server rejected one or more recipients.',
      { cause: error },
    );
  if (code === 'EMESSAGE' && /size|too large/i.test(error?.response ?? ''))
    return new MailProviderError(
      MAIL_ERROR.TOO_LARGE,
      'The message exceeds the size allowed by the mail server.',
      { cause: error },
    );
  if (error?.serverResponseCode === 'NONEXISTENT' || error?.mailboxMissing)
    return new MailProviderError(
      MAIL_ERROR.NOT_FOUND,
      'The folder does not exist.',
      { cause: error },
    );
  if (UNAVAILABLE_CODES.has(code))
    return new MailProviderError(
      MAIL_ERROR.UNAVAILABLE,
      'The mail server could not be reached.',
      { cause: error },
    );
  return new MailProviderError(
    MAIL_ERROR.PROVIDER_ERROR,
    'The mail server returned an unexpected error.',
    { cause: error },
  );
}

const notFound = (what) =>
  new MailProviderError(MAIL_ERROR.NOT_FOUND, `${what} was not found.`);

function toUidRange(uids) {
  const list = [].concat(uids).map(Number);
  if (!list.length || list.some((u) => !Number.isInteger(u) || u < 1))
    throw new MailProviderError(
      MAIL_ERROR.NOT_FOUND,
      'Invalid message identifier.',
    );
  return list.join(',');
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Hostinger Email over standard protocols: IMAP (imap.hostinger.com:993) for
 * mailbox access and SMTP (smtp.hostinger.com:465) for sending, authenticated
 * with the mailbox address and password.
 */
export class HostingerMailProvider extends MailProvider {
  static id = 'hostinger';

  #mailbox;
  #credentials;
  #config;
  #logger;
  #pool;
  #createImapClient;
  #createTransport;
  #folders = null;

  constructor({
    mailbox,
    credentials,
    config,
    logger,
    imapPool = null,
    createImapClient = (options) => new ImapFlow(options),
    createTransport = (options) => nodemailer.createTransport(options),
  }) {
    super();
    this.#mailbox = mailbox;
    this.#credentials = credentials;
    this.#config = config;
    this.#logger = logger;
    this.#pool = imapPool;
    this.#createImapClient = createImapClient;
    this.#createTransport = createTransport;
  }

  capabilities() {
    return {
      listFolders: true,
      listMessages: true,
      getMessage: true,
      search: true,
      searchAttachments: false, // IMAP has no attachment criterion; approximated
      send: true,
      drafts: true,
      flags: true,
      move: true,
      delete: true,
      attachments: true,
      folderManagement: false,
      realtime: false, // clients poll; no push channel is used
    };
  }

  // ---------------------------------------------------------------- connection

  #imapOptions() {
    const { imap, connectionTimeoutMs } = this.#config;
    return {
      host: imap.host,
      port: imap.port,
      secure: imap.secure,
      auth: {
        user: this.#credentials.username,
        pass: this.#credentials.password,
      },
      tls: { minVersion: 'TLSv1.2' },
      logger: false,
      disableAutoIdle: true,
      connectionTimeout: connectionTimeoutMs,
      greetingTimeout: connectionTimeoutMs,
      socketTimeout: 5 * 60_000,
    };
  }

  #smtpOptions() {
    const { smtp, connectionTimeoutMs } = this.#config;
    return {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: !smtp.secure,
      auth: {
        user: this.#credentials.username,
        pass: this.#credentials.password,
      },
      tls: { minVersion: 'TLSv1.2' },
      connectionTimeout: connectionTimeoutMs,
      greetingTimeout: connectionTimeoutMs,
      socketTimeout: 60_000,
    };
  }

  // Credentials are part of the key so a password change never reuses an old session.
  #poolKey() {
    const digest = createHash('sha256')
      .update(`${this.#credentials.username}\0${this.#credentials.password}`)
      .digest('hex')
      .slice(0, 16);
    return `${this.#mailbox.id}:${digest}`;
  }

  async #withClient(work) {
    if (this.#pool)
      return this.#pool.use(this.#poolKey(), this.#imapOptions(), work);
    const client = this.#createImapClient(this.#imapOptions());
    client.on?.('error', () => {});
    await client.connect();
    try {
      return await work(client);
    } finally {
      await client.logout().catch(() => client.close?.());
    }
  }

  async #inFolder(folder, work, { readOnly = false } = {}) {
    if (typeof folder !== 'string' || !folder) throw notFound('The folder');
    return this.#withClient(async (client) => {
      let lock;
      try {
        lock = await client.getMailboxLock(folder, { readOnly });
      } catch (error) {
        const mapped = toProviderError(error);
        throw mapped.code === MAIL_ERROR.PROVIDER_ERROR
          ? notFound('The folder')
          : mapped;
      }
      try {
        return await work(client, client.mailbox);
      } finally {
        lock.release();
      }
    });
  }

  async #run(work) {
    try {
      return await work();
    } catch (error) {
      const mapped = toProviderError(error);
      if (mapped.code === MAIL_ERROR.PROVIDER_ERROR)
        this.#logger?.warn(
          { err: { code: error?.code, message: error?.message } },
          'Unexpected mail provider error',
        );
      throw mapped;
    }
  }

  async #roleFolder(role) {
    this.#folders ??= await this.listFolders();
    return this.#folders.find((f) => f.role === role) ?? null;
  }

  /**
   * Fetches only the first bytes of each message's text part (BODY.PEEK in a
   * read-only session, so nothing is marked read). Messages are grouped by
   * part number so a page costs one or two extra round trips. Preview failures
   * never fail the list.
   */
  async #loadPreviews(client, messages) {
    const previews = new Map();
    const groups = new Map();
    const parts = new Map();
    for (const message of messages) {
      const { text, html } = bodyParts(message.bodyStructure);
      const part = text ?? html;
      if (!part) continue;
      parts.set(message.uid, part);
      const key = `${part.part}|${part.type === 'text/html' ? 'html' : 'text'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(message.uid);
    }
    for (const [key, uids] of groups) {
      const [partId, kind] = key.split('|');
      try {
        const rows = await client.fetchAll(
          uids.join(','),
          {
            uid: true,
            bodyParts: [{ key: partId, maxLength: PREVIEW_BYTES[kind] }],
          },
          { uid: true },
        );
        for (const row of rows) {
          const buffer =
            row.bodyParts?.get(partId) ??
            (row.bodyParts?.size === 1 ? [...row.bodyParts.values()][0] : null);
          const part = parts.get(row.uid);
          if (!buffer || !part) continue;
          const decoded = decodeFragment(buffer, {
            encoding: part.encoding,
            charset: part.charset,
            alreadyDecoded: row.binaryParts?.has(partId) ?? false,
          });
          previews.set(row.uid, toPreview(decoded, { html: kind === 'html' }));
        }
      } catch (error) {
        this.#logger?.warn(
          { code: error?.code },
          'Could not load message previews',
        );
      }
    }
    return previews;
  }

  // -------------------------------------------------------------- operations

  verifyConnection() {
    return this.#run(async () => {
      const client = this.#createImapClient(this.#imapOptions());
      client.on?.('error', () => {});
      await client.connect();
      await client.logout().catch(() => client.close?.());
      const transport = this.#createTransport(this.#smtpOptions());
      try {
        await transport.verify();
      } finally {
        transport.close?.();
      }
      return { imap: 'ok', smtp: 'ok' };
    });
  }

  listFolders() {
    return this.#run(async () => {
      const list = await this.#withClient((client) =>
        client.list({ statusQuery: { messages: true, unseen: true } }),
      );
      const folders = list
        .filter(
          (f) => !f.flags?.has('\\Noselect') && !f.flags?.has('\\NonExistent'),
        )
        .map(toFolder);
      this.#folders = folders;
      return folders;
    });
  }

  listMessages(folder, { page = 1, pageSize = 50 } = {}) {
    return this.#run(() =>
      this.#inFolder(
        folder,
        async (client, mailbox) => {
          const total = mailbox.exists ?? 0;
          const result = {
            folder,
            uidValidity: mailbox.uidValidity?.toString() ?? null,
            total,
            page,
            pageSize,
            messages: [],
          };
          // Newest first: page 1 is the highest sequence numbers.
          const end = total - (page - 1) * pageSize;
          if (end < 1) return result;
          const start = Math.max(1, end - pageSize + 1);
          const messages = await client.fetchAll(
            `${start}:${end}`,
            SUMMARY_QUERY,
          );
          const previews = await this.#loadPreviews(client, messages);
          result.messages = messages
            .sort((a, b) => b.seq - a.seq)
            .map((m) => ({
              ...toMessageSummary(m, folder),
              preview: previews.get(m.uid) ?? '',
            }));
          return result;
        },
        { readOnly: true },
      ),
    );
  }

  getMessage(folder, uid) {
    return this.#run(() =>
      this.#inFolder(
        folder,
        async (client) => {
          const msg = await client.fetchOne(
            String(uid),
            {
              ...SUMMARY_QUERY,
              headers: ['references', 'reply-to', 'list-unsubscribe'],
            },
            { uid: true },
          );
          if (!msg) throw notFound('The message');
          const parts = bodyParts(msg.bodyStructure);
          const readPart = async (part) => {
            if (!part) return null;
            const { content } = await client.download(String(uid), part.part, {
              uid: true,
              maxBytes: MAX_TEXT_PART_BYTES,
            });
            return content ? streamToString(content) : null;
          };
          const html = await readPart(parts.html);
          const text = await readPart(parts.text);
          const headers = parseHeaders(msg.headers);
          return {
            ...toMessageSummary(msg, folder),
            bcc: [],
            replyTo: headers['reply-to'] ?? null,
            inReplyTo: msg.envelope?.inReplyTo ?? null,
            references: parseMessageIdList(headers.references),
            listUnsubscribe: headers['list-unsubscribe'] ?? null,
            html,
            text,
            attachments: attachmentsOf(msg.bodyStructure),
          };
        },
        { readOnly: true },
      ),
    );
  }

  searchMessages(folder, criteria = {}, { page = 1, pageSize = 50 } = {}) {
    return this.#run(() =>
      this.#inFolder(
        folder,
        async (client) => {
          const query = {};
          if (criteria.text) query.text = criteria.text;
          if (criteria.from) query.from = criteria.from;
          if (criteria.to) query.to = criteria.to;
          if (criteria.subject) query.subject = criteria.subject;
          if (criteria.since) query.since = criteria.since;
          if (criteria.before) query.before = criteria.before;
          if (criteria.unread !== undefined) query.seen = !criteria.unread;
          if (criteria.starred !== undefined) query.flagged = criteria.starred;
          if (criteria.hasAttachment)
            query.header = { 'content-type': 'multipart/mixed' };
          if (!Object.keys(query).length) query.all = true;

          const uids = ((await client.search(query, { uid: true })) || [])
            .map(Number)
            .sort((a, b) => b - a);
          const pageUids = uids.slice((page - 1) * pageSize, page * pageSize);
          const messages = pageUids.length
            ? await client.fetchAll(pageUids.join(','), SUMMARY_QUERY, {
                uid: true,
              })
            : [];
          const previews = await this.#loadPreviews(client, messages);
          return {
            folder,
            total: uids.length,
            page,
            pageSize,
            approximate: Boolean(criteria.hasAttachment),
            messages: messages
              .sort((a, b) => b.uid - a.uid)
              .map((m) => ({
                ...toMessageSummary(m, folder),
                preview: previews.get(m.uid) ?? '',
              })),
          };
        },
        { readOnly: true },
      ),
    );
  }

  setFlags(folder, uids, { seen, flagged, answered }) {
    return this.#run(() =>
      this.#inFolder(folder, async (client) => {
        const range = toUidRange(uids);
        const add = [];
        const remove = [];
        if (seen !== undefined) (seen ? add : remove).push('\\Seen');
        if (flagged !== undefined) (flagged ? add : remove).push('\\Flagged');
        if (answered !== undefined)
          (answered ? add : remove).push('\\Answered');
        if (add.length) await client.messageFlagsAdd(range, add, { uid: true });
        if (remove.length)
          await client.messageFlagsRemove(range, remove, { uid: true });
        return { updated: range.split(',').length };
      }),
    );
  }

  moveMessage(folder, uids, destination) {
    return this.#run(async () => {
      if (destination === folder) return { moved: 0 };
      const folders = this.#folders ?? (await this.listFolders());
      if (!folders.some((f) => f.path === destination))
        throw notFound('The destination folder');
      return this.#inFolder(folder, async (client) => {
        const range = toUidRange(uids);
        await client.messageMove(range, destination, { uid: true });
        return { moved: range.split(',').length, destination };
      });
    });
  }

  deleteMessage(folder, uids, { permanent = false } = {}) {
    return this.#run(async () => {
      const trash = await this.#roleFolder('trash');
      if (permanent || (trash && trash.path === folder))
        return this.#inFolder(folder, async (client) => {
          const range = toUidRange(uids);
          await client.messageDelete(range, { uid: true });
          return { deleted: range.split(',').length, permanent: true };
        });
      if (!trash) throw notSupported('trash folder');
      const result = await this.moveMessage(folder, uids, trash.path);
      return { deleted: result.moved, permanent: false, movedTo: trash.path };
    });
  }

  getAttachment(folder, uid, partId) {
    return this.#run(async () => {
      if (!PART_ID.test(String(partId))) throw notFound('The attachment');
      // Buffered (bounded by MAX_ATTACHMENT_BYTES) so the mailbox lock is not
      // held while a slow client downloads.
      return this.#inFolder(
        folder,
        async (client) => {
          const msg = await client.fetchOne(
            String(uid),
            { uid: true, bodyStructure: true },
            { uid: true },
          );
          const meta =
            msg &&
            attachmentsOf(msg.bodyStructure).find((a) => a.partId === partId);
          if (!meta) throw notFound('The attachment');
          const { content } = await client.download(String(uid), partId, {
            uid: true,
            maxBytes: MAX_ATTACHMENT_BYTES,
          });
          if (!content) throw notFound('The attachment');
          const buffer = await streamToBuffer(content);
          return { ...meta, content: buffer, size: buffer.length };
        },
        { readOnly: true },
      );
    });
  }

  // ------------------------------------------------------------------ sending

  async #compose(message) {
    const from = {
      name: message.from.name || '',
      address: message.from.address,
    };
    const domain = from.address.split('@')[1];
    const mail = {
      from,
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
      text: message.text,
      html: message.html,
      inReplyTo: message.inReplyTo || undefined,
      references: message.references?.length ? message.references : undefined,
      attachments: (message.attachments ?? []).map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        content: a.content,
      })),
      messageId: message.messageId ?? `<${randomUUID()}@${domain}>`,
      date: new Date(),
      headers: { 'X-Mailer': 'ValueCraft Mail' },
      // Never let message content make the composer read local files or URLs.
      disableFileAccess: true,
      disableUrlAccess: true,
    };
    const sendNode = new MailComposer(mail).compile();
    const envelope = sendNode.getEnvelope();
    const raw = await sendNode.build();
    const copyNode = new MailComposer(mail).compile();
    copyNode.keepBcc = true; // the stored copy keeps Bcc; the transmitted one never does
    const rawWithBcc = await copyNode.build();
    return { messageId: mail.messageId, envelope, raw, rawWithBcc };
  }

  sendMessage(message) {
    return this.#run(async () => {
      const { messageId, envelope, raw, rawWithBcc } =
        await this.#compose(message);
      const transport = this.#createTransport(this.#smtpOptions());
      let info;
      try {
        info = await transport.sendMail({ envelope, raw });
      } finally {
        transport.close?.();
      }

      let savedToSent = false;
      if (this.#config.saveSentCopy) {
        try {
          const sent = await this.#roleFolder('sent');
          if (sent) {
            await this.#withClient((client) =>
              client.append(sent.path, rawWithBcc, ['\\Seen']),
            );
            savedToSent = true;
          }
        } catch (error) {
          // The message was delivered; a missing Sent copy must not report failure.
          this.#logger?.warn(
            { code: error?.code },
            'Message sent but the Sent copy could not be saved',
          );
        }
      }
      return {
        messageId,
        accepted: info?.accepted?.length ?? 0,
        rejected: info?.rejected?.length ?? 0,
        savedToSent,
      };
    });
  }

  saveDraft(message, { replaceUid } = {}) {
    return this.#run(async () => {
      const drafts = await this.#roleFolder('drafts');
      if (!drafts) throw notSupported('drafts folder');
      const { messageId, rawWithBcc } = await this.#compose(message);
      const appended = await this.#withClient((client) =>
        client.append(drafts.path, rawWithBcc, ['\\Draft', '\\Seen']),
      );
      if (replaceUid)
        await this.#inFolder(drafts.path, (client) =>
          client.messageDelete(toUidRange(replaceUid), { uid: true }),
        );
      return {
        folder: drafts.path,
        uid: appended?.uid ?? null,
        messageId,
      };
    });
  }

  getDrafts(options) {
    return this.#run(async () => {
      const drafts = await this.#roleFolder('drafts');
      if (!drafts) throw notSupported('drafts folder');
      return this.listMessages(drafts.path, options);
    });
  }

  async dispose() {
    this.#pool?.evict(`${this.#mailbox.id}:`);
  }
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
