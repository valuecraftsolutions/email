import { mailboxRepository } from '../../repositories/mailboxRepository.js';
import { AppError } from '../../utils/errors.js';
import { AUDIT_ACTIONS } from '../security/auditActions.js';
import {
  sanitizeEmailHtml,
  sanitizeOutgoingHtml,
} from '../security/htmlSanitizer.js';
import { FOLDER_ROLES, MAIL_ERROR, MailProviderError } from './MailProvider.js';
import { prepareAttachments } from './attachmentPolicy.js';
import { toAppError } from './mailErrors.js';

// Avoid a status write on every request; refresh "last connected" at most every 5 minutes.
const STATUS_REFRESH_MS = 5 * 60_000;
const DUPLICATE_WINDOW_MS = 10 * 60_000;

export const credentialsAad = (mailboxId) => `mailbox:${mailboxId}`;

/**
 * Mail operations for the signed-in user. The user can only ever reach the
 * mailbox mapped to them in user_mailboxes; credentials are decrypted
 * server-side per request and never leave the API.
 */
export function createMailService({
  db,
  config,
  logger,
  encryptionService,
  auditService,
  providerFactory,
}) {
  const recentSends = new Map(); // `${userId}:${clientRequestId}` -> expiry

  async function openMailbox(userId) {
    const mailbox = await mailboxRepository.findPrimaryWithCredentials(
      db,
      userId,
    );
    if (!mailbox || !mailbox.credentials_encrypted)
      throw new AppError(
        409,
        'MAILBOX_NOT_CONNECTED',
        'Your mailbox is not connected yet. Connect it in Settings → Mailbox.',
      );
    if (mailbox.status !== 'ACTIVE')
      throw new AppError(
        409,
        'MAILBOX_DISABLED',
        'This mailbox has been disabled by an administrator.',
      );
    let credentials;
    try {
      credentials = JSON.parse(
        encryptionService.decrypt(
          mailbox.credentials_encrypted,
          credentialsAad(mailbox.id),
        ),
      );
    } catch (error) {
      logger.error(
        { mailboxId: mailbox.id, err: { message: error.message } },
        'Stored mailbox credentials could not be decrypted',
      );
      throw new AppError(
        409,
        'MAILBOX_CREDENTIALS_INVALID',
        'Your mailbox needs to be reconnected. Reconnect it in Settings → Mailbox.',
      );
    }
    const provider = providerFactory.create(mailbox.provider, {
      mailbox: { id: mailbox.id, emailAddress: mailbox.email_address },
      credentials,
    });
    return { mailbox, provider };
  }

  async function recordOutcome(mailbox, error) {
    try {
      if (!error) {
        const last = mailbox.last_connected_at
          ? new Date(mailbox.last_connected_at).getTime()
          : 0;
        if (
          mailbox.connection_status !== 'CONNECTED' ||
          Date.now() - last > STATUS_REFRESH_MS
        )
          await mailboxRepository.markConnected(db, mailbox.id);
      } else if (
        error instanceof MailProviderError &&
        [MAIL_ERROR.AUTH_FAILED, MAIL_ERROR.UNAVAILABLE].includes(error.code)
      ) {
        await mailboxRepository.markFailed(db, mailbox.id, error.code);
        logger.warn(
          { mailboxId: mailbox.id, code: error.code },
          'Mailbox provider access failed',
        );
      }
    } catch (statusError) {
      logger.error({ err: statusError }, 'Could not record mailbox status');
    }
  }

  /** Runs one provider operation for the user's mailbox with status tracking and error mapping. */
  async function withProvider(userId, work) {
    const { mailbox, provider } = await openMailbox(userId);
    try {
      const result = await work(provider, mailbox);
      await recordOutcome(mailbox, null);
      return result;
    } catch (error) {
      await recordOutcome(mailbox, error);
      throw toAppError(error);
    }
  }

  /** Accepts a folder path or a role alias ("sent", "trash", ...). */
  async function resolveFolder(provider, ref) {
    if (!ref || ref.toLowerCase() === 'inbox') return 'INBOX';
    const role = ref.toLowerCase();
    if (!FOLDER_ROLES.includes(role)) return ref;
    const folders = await provider.listFolders();
    if (folders.some((f) => f.path === ref)) return ref;
    const match = folders.find((f) => f.role === role);
    if (!match)
      throw new MailProviderError(
        MAIL_ERROR.NOT_FOUND,
        `This mailbox has no ${role} folder.`,
      );
    return match.path;
  }

  function claimSend(userId, clientRequestId) {
    if (!clientRequestId) return;
    const now = Date.now();
    for (const [key, expiry] of recentSends)
      if (expiry < now) recentSends.delete(key);
    const key = `${userId}:${clientRequestId}`;
    if (recentSends.has(key))
      throw new AppError(
        409,
        'DUPLICATE_SUBMISSION',
        'This message has already been sent.',
      );
    recentSends.set(key, now + DUPLICATE_WINDOW_MS);
  }

  /** Rewrites cid: references to same-origin attachment URLs so inline images render. */
  function linkInlineImages(html, message, folderPath) {
    if (!html) return { html, referenced: new Set() };
    const referenced = new Set();
    const byCid = new Map(
      message.attachments
        .filter((a) => a.contentId && a.contentType.startsWith('image/'))
        .map((a) => [a.contentId.toLowerCase(), a]),
    );
    const rewritten = html.replace(/src="cid:([^"]+)"/gi, (match, cid) => {
      const attachment = byCid.get(cid.toLowerCase());
      if (!attachment) return 'src=""';
      referenced.add(attachment.partId);
      return `src="/api/mail/messages/${message.uid}/attachments/${attachment.partId}?folder=${encodeURIComponent(folderPath)}"`;
    });
    return { html: rewritten, referenced };
  }

  /** Uploaded files plus attachments copied from existing messages (forward / edited draft). */
  async function collectAttachments(provider, message, uploads) {
    const existing = [];
    for (const ref of message.includeAttachments ?? []) {
      const file = await provider.getAttachment(
        await resolveFolder(provider, ref.folder),
        ref.uid,
        ref.partId,
      );
      existing.push({
        filename: file.filename,
        contentType: file.contentType,
        content: file.content,
      });
    }
    return prepareAttachments({ uploads, existing, policy: config.mail });
  }

  function toOutgoing(auth, mailbox, message) {
    return {
      from: {
        name: auth.user.displayName || auth.user.fullName,
        address: mailbox.email_address,
      },
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
      html: message.html ? sanitizeOutgoingHtml(message.html) : undefined,
      text: message.text,
      inReplyTo: message.inReplyTo,
      references: message.references,
      attachments: message.attachments,
    };
  }

  return {
    testConnection: (userId) =>
      withProvider(userId, async (provider, mailbox) => ({
        emailAddress: mailbox.email_address,
        ...(await provider.verifyConnection()),
      })),

    capabilities: (userId) =>
      withProvider(userId, async (provider) => provider.capabilities()),

    listFolders: (userId) =>
      withProvider(userId, (provider) => provider.listFolders()),

    listMessages: (userId, { folder, page, pageSize }) =>
      withProvider(userId, async (provider) => {
        // "Starred" is a view, not an IMAP folder: flagged messages in the inbox.
        if (folder?.toLowerCase() === 'starred') {
          const result = await provider.searchMessages(
            'INBOX',
            { starred: true },
            { page, pageSize },
          );
          return { ...result, view: 'starred' };
        }
        return provider.listMessages(await resolveFolder(provider, folder), {
          page,
          pageSize,
        });
      }),

    searchMessages: (userId, { folder, page, pageSize, ...criteria }) =>
      withProvider(userId, async (provider) =>
        provider.searchMessages(
          await resolveFolder(provider, folder),
          criteria,
          {
            page,
            pageSize,
          },
        ),
      ),

    getMessage: (userId, { folder, uid, markRead, allowRemoteImages }) =>
      withProvider(userId, async (provider) => {
        const path = await resolveFolder(provider, folder);
        const message = await provider.getMessage(path, uid);
        if (markRead && message.unread) {
          await provider.markRead(path, [uid]);
          message.unread = false;
        }
        const sanitized = sanitizeEmailHtml(message.html, {
          allowRemoteImages,
        });
        const { html, referenced } = linkInlineImages(
          message.html ? sanitized.html : null,
          message,
          path,
        );
        return {
          ...message,
          html,
          blockedImages: sanitized.blockedImages,
          attachments: message.attachments.map((a) => ({
            ...a,
            embedded: referenced.has(a.partId),
          })),
        };
      }),

    getAttachment: (userId, { folder, uid, partId }) =>
      withProvider(userId, async (provider) =>
        provider.getAttachment(
          await resolveFolder(provider, folder),
          uid,
          partId,
        ),
      ),

    updateFlags: (userId, { folder, uids, seen, flagged }) =>
      withProvider(userId, async (provider) =>
        provider.setFlags(await resolveFolder(provider, folder), uids, {
          seen,
          flagged,
        }),
      ),
    moveMessages: (userId, { folder, uids, destination }) =>
      withProvider(userId, async (provider) =>
        provider.moveMessage(
          await resolveFolder(provider, folder),
          uids,
          await resolveFolder(provider, destination),
        ),
      ),

    deleteMessages: (userId, { folder, uids, permanent }) =>
      withProvider(userId, async (provider) =>
        provider.deleteMessage(await resolveFolder(provider, folder), uids, {
          permanent,
        }),
      ),

    async sendMessage(auth, message, context, uploads = []) {
      const recipients =
        message.to.length +
        (message.cc?.length ?? 0) +
        (message.bcc?.length ?? 0);
      if (recipients > config.mail.maxRecipients)
        throw new AppError(
          422,
          'TOO_MANY_RECIPIENTS',
          `A message can have at most ${config.mail.maxRecipients} recipients.`,
        );
      claimSend(auth.userId, message.clientRequestId);
      try {
        let attachmentCount = 0;
        const result = await withProvider(
          auth.userId,
          async (provider, mailbox) => {
            const attachments = await collectAttachments(
              provider,
              message,
              uploads,
            );
            attachmentCount = attachments.length;
            const sent = await provider.sendMessage(
              toOutgoing(auth, mailbox, { ...message, attachments }),
            );
            // Follow-up bookkeeping must never turn a delivered message into an error.
            const followUps = [];
            if (message.replyTo)
              followUps.push(
                resolveFolder(provider, message.replyTo.folder).then((path) =>
                  provider.setFlags(path, [message.replyTo.uid], {
                    answered: true,
                  }),
                ),
              );
            if (message.draftUid)
              followUps.push(
                resolveFolder(provider, 'drafts').then((path) =>
                  provider.deleteMessage(path, [message.draftUid], {
                    permanent: true,
                  }),
                ),
              );
            for (const outcome of await Promise.allSettled(followUps))
              if (outcome.status === 'rejected')
                logger.warn(
                  { code: outcome.reason?.code },
                  'Post-send update failed',
                );
            return sent;
          },
        );
        await auditService.recordSafely({
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.MAIL_SENT,
          resourceType: 'message',
          resourceId: result.messageId,
          metadata: {
            recipients,
            attachments: attachmentCount,
            reply: Boolean(message.inReplyTo),
          },
          context,
        });
        return result;
      } catch (error) {
        // Allow a retry with the same id when nothing was sent.
        if (message.clientRequestId)
          recentSends.delete(`${auth.userId}:${message.clientRequestId}`);
        throw error;
      }
    },

    saveDraft: (auth, message, uploads = []) =>
      withProvider(auth.userId, async (provider, mailbox) => {
        const attachments = await collectAttachments(
          provider,
          message,
          uploads,
        );
        return provider.saveDraft(
          toOutgoing(auth, mailbox, { ...message, attachments }),
          { replaceUid: message.replaceUid },
        );
      }),

    listDrafts: (userId, { page, pageSize }) =>
      withProvider(userId, (provider) =>
        provider.getDrafts({ page, pageSize }),
      ),
  };
}
