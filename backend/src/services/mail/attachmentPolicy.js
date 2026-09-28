import path from 'node:path';
import libmime from 'libmime';
import { AppError } from '../../utils/errors.js';

const MAX_FILENAME = 200;

/**
 * Normalises a client-supplied filename for use in a MIME header only. Files
 * are held in memory and never written to disk under this name.
 */
export function safeFilename(name) {
  const base = path.win32
    .basename(path.posix.basename(String(name ?? '')))
    .replace(/[\u0000-\u001f\u007f"<>|:*?\\/]/g, '_')
    .replace(/^[.\s]+/, '')
    .trim();
  if (!base) return 'attachment';
  if (base.length <= MAX_FILENAME) return base;
  const ext = path.extname(base).slice(0, 20);
  return base.slice(0, MAX_FILENAME - ext.length) + ext;
}

/** All extensions of a filename ("invoice.pdf.exe" → ["pdf", "exe"]). */
const extensionsOf = (filename) =>
  filename.toLowerCase().split('.').slice(1).filter(Boolean);

/**
 * Validates outgoing attachments against configurable limits and blocked
 * types. Content type is derived from the extension, never trusted from the
 * browser.
 */
export function prepareAttachments({ uploads = [], existing = [], policy }) {
  const files = [
    ...uploads.map((u) => ({
      filename: safeFilename(u.originalname),
      content: u.buffer,
    })),
    ...existing.map((e) => ({
      filename: safeFilename(e.filename),
      content: e.content,
    })),
  ];

  if (files.length > policy.maxAttachments)
    throw new AppError(
      422,
      'TOO_MANY_ATTACHMENTS',
      `Attach at most ${policy.maxAttachments} files.`,
    );

  let total = 0;
  for (const file of files) {
    const blocked = extensionsOf(file.filename).find((ext) =>
      policy.blockedExtensions.includes(ext),
    );
    if (blocked)
      throw new AppError(
        422,
        'ATTACHMENT_TYPE_BLOCKED',
        `Files of type .${blocked} cannot be sent. Compress or share them another way.`,
        [{ field: 'attachments', message: file.filename }],
      );
    if (!file.content?.length)
      throw new AppError(
        422,
        'ATTACHMENT_EMPTY',
        `The file ${file.filename} is empty.`,
      );
    total += file.content.length;
  }
  if (total > policy.maxAttachmentBytes)
    throw new AppError(
      413,
      'ATTACHMENTS_TOO_LARGE',
      `Attachments can total at most ${Math.floor(policy.maxAttachmentBytes / 1048576)} MB.`,
    );

  return files.map((file) => ({
    ...file,
    contentType: libmime.detectMimeType(file.filename),
  }));
}
