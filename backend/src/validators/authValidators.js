import { z } from 'zod';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../services/auth/passwordService.js';

export const emailSchema = z
  .string({ error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .min(1, 'Email is required.')
  .max(254, 'Email is too long.')
  .pipe(z.email('Enter a valid email address.'));

export const newPasswordSchema = z
  .string({ error: 'Password is required.' })
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`)
  .refine(
    (value) => value.trim().length === value.length,
    'Remove leading or trailing spaces.',
  )
  .refine(
    (value) => new Set(value).size >= 5,
    'Use a less repetitive password.',
  );

export const loginSchema = z.object({
  email: emailSchema,
  // Upper bound prevents hashing arbitrarily large inputs.
  password: z
    .string({ error: 'Password is required.' })
    .min(1, 'Password is required.')
    .max(256, 'Password is too long.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ error: 'Current password is required.' })
    .min(1, 'Current password is required.')
    .max(256),
  newPassword: newPasswordSchema,
});

export const sessionIdParamsSchema = z.object({
  sessionId: z.uuid('Invalid session id.'),
});
