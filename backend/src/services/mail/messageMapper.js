/** Converts IMAP structures (imapflow) into provider-neutral API shapes. */

const SPECIAL_USE_ROLES = {
  '\\Inbox': 'inbox',
  '\\Sent': 'sent',
  '\\Drafts': 'drafts',
  '\\Junk': 'spam',
  '\\Trash': 'trash',
  '\\Archive': 'archive',
};

export const folderRole = (folder) =>
  SPECIAL_USE_ROLES[folder.specialUse] ??
  (folder.path?.toUpperCase() === 'INBOX' ? 'inbox' : null);

export const toFolder = (folder) => ({
  path: folder.path,
  name: folder.name,
  delimiter: folder.delimiter ?? null,
  parentPath: folder.parentPath || null,
  role: folderRole(folder),
  total: folder.status?.messages ?? null,
  unread: folder.status?.unseen ?? null,
});

const toAddress = (a) =>
  a?.address
    ? { name: a.name || null, address: a.address.toLowerCase() }
    : null;

const toAddresses = (list) => (list ?? []).map(toAddress).filter(Boolean);

/** Flattens a BODYSTRUCTURE tree into its leaf parts. */
export function leafParts(node, out = []) {
  if (!node) return out;
  if (node.childNodes?.length) {
    for (const child of node.childNodes) leafParts(child, out);
    return out;
  }
  out.push({
    // A single-part message has no part number; its body is section 1.
    part: node.part || '1',
    type: (node.type || 'application/octet-stream').toLowerCase(),
    disposition: node.disposition?.toLowerCase() ?? null,
    filename:
      node.dispositionParameters?.filename || node.parameters?.name || null,
    size: node.size ?? null,
    encoding: node.encoding ?? null,
    charset: node.parameters?.charset ?? null,
    contentId: node.id ? node.id.replace(/^<|>$/g, '') : null,
  });
  return out;
}

const isBodyText = (p) =>
  (p.type === 'text/plain' || p.type === 'text/html') &&
  p.disposition !== 'attachment' &&
  !(p.disposition === 'inline' && p.filename);

export const isAttachment = (p) => !isBodyText(p);

export function bodyParts(structure) {
  const leaves = leafParts(structure);
  return {
    html: leaves.find((p) => p.type === 'text/html' && isBodyText(p)) ?? null,
    text: leaves.find((p) => p.type === 'text/plain' && isBodyText(p)) ?? null,
  };
}

export const attachmentsOf = (structure) =>
  leafParts(structure)
    .filter(isAttachment)
    .map((p) => ({
      partId: p.part,
      filename:
        p.filename ||
        (p.type === 'message/rfc822' ? 'attached-message.eml' : 'attachment'),
      contentType: p.type,
      size: p.size,
      inline: p.disposition === 'inline',
      contentId: p.contentId,
    }));

export function toMessageSummary(msg, folder) {
  const flags = msg.flags ?? new Set();
  const envelope = msg.envelope ?? {};
  return {
    uid: msg.uid,
    folder,
    messageId: envelope.messageId ?? null,
    subject: envelope.subject ?? '',
    from: toAddress(envelope.from?.[0]),
    to: toAddresses(envelope.to),
    cc: toAddresses(envelope.cc),
    date: envelope.date ?? msg.internalDate ?? null,
    receivedAt: msg.internalDate ?? null,
    size: msg.size ?? null,
    unread: !flags.has('\\Seen'),
    starred: flags.has('\\Flagged'),
    answered: flags.has('\\Answered'),
    draft: flags.has('\\Draft'),
    hasAttachments: msg.bodyStructure
      ? leafParts(msg.bodyStructure).some(
          (p) => isAttachment(p) && p.disposition !== 'inline',
        )
      : false,
  };
}

/** Parses a raw header block into a lowercase name → value map (unfolded). */
export function parseHeaders(buffer) {
  const headers = {};
  if (!buffer) return headers;
  const text = buffer.toString('utf8').replace(/\r?\n[ \t]+/g, ' ');
  for (const line of text.split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index > 0)
      headers[line.slice(0, index).trim().toLowerCase()] = line
        .slice(index + 1)
        .trim();
  }
  return headers;
}

export const parseMessageIdList = (value) =>
  value ? (value.match(/<[^<>\s]+>/g) ?? []) : [];

export { toAddresses };
