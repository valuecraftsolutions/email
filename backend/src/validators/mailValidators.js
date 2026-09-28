import { z } from 'zod';
import { emailSchema } from './authValidators.js';

const queryBool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

// No control characters: blocks header injection through folder names or subjects.
const noControlChars = (max) =>
  z
    .string()
    .max(max)
    .refine(
      (v) => !/[\u0000-\u001f\u007f]/.test(v),
      'Contains invalid characters.',
    );

const folder = noControlChars(512).min(1).default('inbox');
const page = z.coerce.number().int().min(1).max(10000).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(50);
const uid = z.coerce.number().int().min(1).max(4294967295);
const uids = z.array(uid).min(1, 'Select at least one message.').max(500);
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .transform((v) => new Date(`${v}T00:00:00Z`))
  .optional();
const messageIdHeader = z
  .string()
  .regex(/^<[^<>\s]{1,250}>$/, 'Invalid message id.');

export const listMessagesQuery = z.object({ folder, page, pageSize });

export const pageQuery = z.object({ page, pageSize });

export const messageParams = z.object({ uid });

export const messageQuery = z.object({
  folder,
  markRead: queryBool,
  images: queryBool,
});

export const attachmentParams = z.object({
  uid,
  partId: z.string().regex(/^\d+(\.\d+){0,20}$/, 'Invalid attachment id.'),
});

export const folderQuery = z.object({ folder });

export const searchQuery = z.object({
  folder,
  page,
  pageSize,
  q: noControlChars(200).optional(),
  from: noControlChars(200).optional(),
  to: noControlChars(200).optional(),
  subject: noControlChars(200).optional(),
  since: dateOnly,
  before: dateOnly,
  unread: queryBool,
  starred: queryBool,
  hasAttachment: queryBool,
});

export const flagsBody = z
  .object({
    folder,
    uids,
    seen: z.boolean().optional(),
    flagged: z.boolean().optional(),
  })
  .refine((b) => b.seen !== undefined || b.flagged !== undefined, {
    message: 'Specify seen or flagged.',
    path: ['seen'],
  });

export const moveBody = z.object({
  folder,
  uids,
  destination: noControlChars(512).min(1),
});

export const deleteBody = z.object({
  folder,
  uids,
  permanent: z.boolean().default(false),
});

const recipients = z.array(emailSchema).max(1000);

const composeFields = {
  cc: recipients.default([]),
  bcc: recipients.default([]),
  subject: noControlChars(998).default(''),
  html: z.string().max(2_000_000).optional(),
  text: z.string().max(1_000_000).optional(),
  inReplyTo: messageIdHeader.optional(),
  references: z.array(messageIdHeader).max(100).default([]),
};

const messageRef = z.object({ folder: noControlChars(512).min(1), uid });

const attachmentRef = messageRef.extend({
  partId: z.string().regex(/^\d+(\.\d+){0,20}$/, 'Invalid attachment id.'),
});

export const sendBody = z.object({
  to: recipients.min(1, 'Add at least one recipient.'),
  ...composeFields,
  // Attachments copied server-side from the user's own messages (forward, edited draft).
  includeAttachments: z.array(attachmentRef).max(100).default([]),
  replyTo: messageRef.optional(),
  draftUid: uid.optional(),
  clientRequestId: z.uuid().optional(),
});

export const draftBody = z.object({
  to: recipients.default([]),
  ...composeFields,
  includeAttachments: z.array(attachmentRef).max(100).default([]),
  replaceUid: uid.optional(),
});

export const connectMailboxBody = z.object({
  password: z
    .string({ error: 'Mailbox password is required.' })
    .min(1, 'Mailbox password is required.')
    .max(256),
});
