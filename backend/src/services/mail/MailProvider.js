/**
 * Provider-neutral mail contract. Business logic talks only to this interface,
 * so another provider can be added by implementing it and registering it in
 * mailProviderRegistry.js.
 *
 * Folder arguments are provider folder paths (e.g. "INBOX"). Message ids are
 * the provider's per-folder UIDs. Every unimplemented operation throws a
 * MailProviderError with code NOT_SUPPORTED instead of faking a result.
 */

export const MAIL_ERROR = Object.freeze({
  AUTH_FAILED: 'AUTH_FAILED',
  UNAVAILABLE: 'UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_FOUND: 'NOT_FOUND',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  RECIPIENT_REJECTED: 'RECIPIENT_REJECTED',
  TOO_LARGE: 'TOO_LARGE',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
});

export class MailProviderError extends Error {
  constructor(code, message, { cause, capability } = {}) {
    super(message, { cause });
    this.name = 'MailProviderError';
    this.code = code;
    this.capability = capability;
  }
}

export const notSupported = (capability) =>
  new MailProviderError(
    MAIL_ERROR.NOT_SUPPORTED,
    `The mail provider does not support "${capability}".`,
    { capability },
  );

/** Standard folder roles exposed to the UI regardless of provider naming. */
export const FOLDER_ROLES = Object.freeze([
  'inbox',
  'sent',
  'drafts',
  'spam',
  'trash',
  'archive',
]);

export class MailProvider {
  /** @returns {Record<string, boolean>} */
  capabilities() {
    return {};
  }

  /** Checks that the configured credentials can reach the provider. */
  async verifyConnection() {
    throw notSupported('verifyConnection');
  }

  /** @returns {Promise<Array<{path,name,delimiter,parentPath,role,total,unread}>>} */
  async listFolders() {
    throw notSupported('listFolders');
  }

  async listMessages(/* folder, { page, pageSize } */) {
    throw notSupported('listMessages');
  }

  async getMessage(/* folder, uid */) {
    throw notSupported('getMessage');
  }

  async searchMessages(/* folder, criteria, { page, pageSize } */) {
    throw notSupported('searchMessages');
  }

  async sendMessage(/* message */) {
    throw notSupported('sendMessage');
  }

  async saveDraft(/* message, { replaceUid } */) {
    throw notSupported('saveDraft');
  }

  async getDrafts(/* { page, pageSize } */) {
    throw notSupported('getDrafts');
  }

  async markRead(folder, uids) {
    return this.setFlags(folder, uids, { seen: true });
  }

  async markUnread(folder, uids) {
    return this.setFlags(folder, uids, { seen: false });
  }

  async starMessage(folder, uids) {
    return this.setFlags(folder, uids, { flagged: true });
  }

  async unstarMessage(folder, uids) {
    return this.setFlags(folder, uids, { flagged: false });
  }

  async setFlags(/* folder, uids, { seen, flagged } */) {
    throw notSupported('setFlags');
  }

  async moveMessage(/* folder, uids, destination */) {
    throw notSupported('moveMessage');
  }

  async deleteMessage(/* folder, uids, { permanent } */) {
    throw notSupported('deleteMessage');
  }

  /** @returns {Promise<{content: import('node:stream').Readable, filename, contentType, size}>} */
  async getAttachment(/* folder, uid, partId */) {
    throw notSupported('getAttachment');
  }

  /** Releases pooled connections held for this mailbox. */
  async dispose() {}
}
