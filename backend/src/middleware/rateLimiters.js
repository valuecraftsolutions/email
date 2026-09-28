import rateLimit from 'express-rate-limit';
import { AppError } from '../utils/errors.js';

const tooMany = (req, res, next) =>
  next(
    new AppError(
      429,
      'RATE_LIMITED',
      'Too many requests. Please wait a moment and try again.',
    ),
  );

/** Per-IP throttle for sign-in attempts. Successful sign-ins do not count. */
export const createLoginLimiter = (config) =>
  rateLimit({
    windowMs: config.security.loginRateLimit.windowMs,
    limit: config.security.loginRateLimit.max,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooMany,
  });

/** Coarse per-IP ceiling for the whole API. */
export const createApiLimiter = (config) =>
  rateLimit({
    windowMs: config.security.apiRateLimit.windowMs,
    limit: config.security.apiRateLimit.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooMany,
  });

// Per-user limits for authenticated routes (run after authenticate).
const perUser = (req) => `user:${req.auth.userId}`;

/** Limits outgoing mail per user to contain a compromised session or runaway client. */
export const createSendLimiter = (config) =>
  rateLimit({
    windowMs: 60_000,
    limit: config.mail.sendRatePerMinute,
    keyGenerator: perUser,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooMany,
  });

/** Mailbox password attempts per user (each one is a provider login). */
export const createMailboxConnectLimiter = () =>
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    keyGenerator: perUser,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooMany,
  });
