/** Formatting and reply/forward helpers for the webmail UI. */

export const EMAIL_PATTERN =
  /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

export const isEmail = (value) => EMAIL_PATTERN.test(String(value).trim());

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const formatAddress = (a) =>
  !a ? '' : a.name ? `${a.name} <${a.address}>` : a.address;

export const displayName = (a) => a?.name || a?.address || '(unknown sender)';

export const addressList = (list = []) => list.map(formatAddress).join(', ');

export function formatBytes(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});
const dayFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});
const fullDateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const longFmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'full',
  timeStyle: 'short',
});

/** Compact date for list rows: time today, "Sep 27" this year, else full date. */
export function formatListDate(value) {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return timeFmt.format(date);
  if (date.getFullYear() === now.getFullYear()) return dayFmt.format(date);
  return fullDateFmt.format(date);
}

export const formatLongDate = (value) =>
  value ? longFmt.format(new Date(value)) : '';

const prefixed = (subject, prefix) => {
  const clean = (subject || '').trim();
  return new RegExp(`^${prefix}:`, 'i').test(clean)
    ? clean
    : `${prefix}: ${clean}`;
};

/** Removes same-origin inline image links, which recipients could not load. */
const stripLocalImages = (html) =>
  html
    .replace(/<img\b[^>]*\bsrc="\/api\/[^"]*"[^>]*>/gi, '')
    .replace(/\sdata-blocked-src="[^"]*"/gi, '');

function quotedBody(message) {
  if (message.html) return stripLocalImages(message.html);
  return `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(message.text || '')}</pre>`;
}

const uniqueByAddress = (list, exclude) => {
  const seen = new Set(exclude.map((a) => a.toLowerCase()));
  return list.filter((a) => {
    const key = a.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Parses a raw Reply-To header value into addresses. */
const parseReplyTo = (value) =>
  (value?.match(/[^\s<>,;"]+@[^\s<>,;"]+/g) ?? []).map((a) => a.toLowerCase());

export function buildReply(message, { all = false, self }) {
  const replyTarget = parseReplyTo(message.replyTo);
  const sender = replyTarget.length
    ? replyTarget
    : [message.from?.address].filter(Boolean);
  const to = uniqueByAddress(
    [...sender, ...(all ? message.to.map((a) => a.address) : [])],
    [self],
  );
  const cc = all
    ? uniqueByAddress(
        message.cc.map((a) => a.address),
        [self, ...to],
      )
    : [];
  const references = [
    ...new Set(
      [...(message.references ?? []), message.messageId].filter(Boolean),
    ),
  ].slice(-50);
  const html =
    `<p><br></p><p>On ${escapeHtml(formatLongDate(message.date))}, ${escapeHtml(formatAddress(message.from))} wrote:</p>` +
    `<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex">${quotedBody(message)}</blockquote>`;
  return {
    to: to.length ? to : sender,
    cc,
    subject: prefixed(message.subject, 'Re'),
    html,
    inReplyTo: message.messageId || undefined,
    references,
    replyTo: { folder: message.folder, uid: message.uid },
  };
}

export function buildForward(message) {
  const header = [
    '---------- Forwarded message ---------',
    `From: ${formatAddress(message.from)}`,
    `Date: ${formatLongDate(message.date)}`,
    `Subject: ${message.subject || ''}`,
    `To: ${addressList(message.to)}`,
    message.cc?.length ? `Cc: ${addressList(message.cc)}` : null,
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join('<br>');
  return {
    to: [],
    cc: [],
    subject: prefixed(message.subject, 'Fwd'),
    html: `<p><br></p><p>${header}</p><br>${quotedBody(message)}`,
    includeAttachments: message.attachments
      .filter((a) => !a.embedded)
      .map((a) => ({
        folder: message.folder,
        uid: message.uid,
        partId: a.partId,
        filename: a.filename,
        size: a.size,
      })),
  };
}

/** Opens an existing draft for editing, keeping its attachments. */
export function buildDraftEdit(message) {
  return {
    to: message.to.map((a) => a.address),
    cc: message.cc.map((a) => a.address),
    bcc: (message.bcc ?? []).map((a) => a.address),
    subject: message.subject || '',
    html: message.html
      ? stripLocalImages(message.html)
      : `<p>${escapeHtml(message.text || '').replace(/\n/g, '<br>')}</p>`,
    inReplyTo: message.inReplyTo || undefined,
    references: message.references ?? [],
    draftUid: message.uid,
    includeAttachments: message.attachments
      .filter((a) => !a.embedded)
      .map((a) => ({
        folder: message.folder,
        uid: message.uid,
        partId: a.partId,
        filename: a.filename,
        size: a.size,
      })),
  };
}
