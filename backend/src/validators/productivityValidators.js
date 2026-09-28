import { z } from 'zod';
import { emailSchema } from './authValidators.js';

const text = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
      'Contains invalid characters.',
    )
    .transform((v) => v || null);

const optionalText = (max) => text(max).nullable().optional();

const contactFields = {
  firstName: optionalText(100),
  lastName: optionalText(100),
  displayName: optionalText(200),
  email: emailSchema
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  phone: optionalText(40),
  company: optionalText(150),
  jobTitle: optionalText(100),
  notes: optionalText(5000),
  isFavorite: z.boolean().optional(),
};

const hasIdentity = (c) =>
  Boolean(c.displayName || c.firstName || c.lastName || c.email);

export const contactCreateBody = z.object(contactFields).refine(hasIdentity, {
  message: 'Enter a name or an email address.',
  path: ['displayName'],
});

export const contactUpdateBody = z.object(contactFields);

export const contactIdParams = z.object({ id: z.uuid('Invalid contact id.') });

export const contactListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  favorite: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const suggestQuery = z.object({
  q: z.string().trim().min(1, 'Type at least one character.').max(100),
});

const signatureHtml = z.string().max(20_000, 'The signature is too long.');

export const mySignatureBody = z
  .object({
    mode: z.enum(['company', 'own', 'none']).optional(),
    html: signatureHtml.optional(),
  })
  .refine((b) => b.mode !== undefined || b.html !== undefined, {
    message: 'Nothing to update.',
    path: ['mode'],
  });

export const companySignatureBody = z.object({ html: signatureHtml });

export const previewSignatureBody = z.object({ html: signatureHtml });

export const preferencesBody = z
  .object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    messagesPerPage: z
      .union([z.literal(25), z.literal(50), z.literal(100)])
      .optional(),
    density: z.enum(['comfortable', 'compact']).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: 'Nothing to update.',
    path: ['theme'],
  });

export const profileBody = z
  .object({
    displayName: optionalText(150),
    phone: optionalText(40).refine(
      (v) => v == null || /^[+()\d\s.-]{3,40}$/.test(v),
      'Use digits, spaces and + ( ) - only.',
    ),
  })
  .refine((b) => b.displayName !== undefined || b.phone !== undefined, {
    message: 'Nothing to update.',
    path: ['displayName'],
  });
