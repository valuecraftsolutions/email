import { sessionRepository } from '../../repositories/sessionRepository.js';
import { toSessionDto } from '../../models/sessionModel.js';
import { generateToken, hmac, safeEqual, sha256 } from '../../utils/crypto.js';
import { normalizeIp, normalizeUserAgent } from '../../utils/clientInfo.js';

// Avoid a write on every request: last activity is refreshed at most once a minute.
const TOUCH_INTERVAL_MS = 60_000;
const MAX_TOKEN_LENGTH = 128;

/**
 * Opaque server-side sessions. The browser holds a random token in an
 * HttpOnly cookie; the database only ever sees its SHA-256 hash.
 */
export function createSessionService({ db, config }) {
  const { ttlHours, idleMinutes, secret } = config.session;

  const csrfTokenFor = (sessionId) => hmac(secret, `csrf:${sessionId}`);

  return {
    idleMinutes,

    async create(executor, { userId, context }) {
      const token = generateToken(32);
      const session = await sessionRepository.create(executor, {
        userId,
        tokenHash: sha256(token),
        ipAddress: normalizeIp(context?.ip),
        userAgent: normalizeUserAgent(context?.userAgent),
        expiresAt: new Date(Date.now() + ttlHours * 3_600_000),
      });
      return { token, session };
    },

    async resolve(token) {
      if (
        typeof token !== 'string' ||
        !token ||
        token.length > MAX_TOKEN_LENGTH
      )
        return null;
      const row = await sessionRepository.findActiveByTokenHash(
        db,
        sha256(token),
        idleMinutes,
      );
      if (!row) return null;
      if (Date.now() - new Date(row.last_seen_at).getTime() > TOUCH_INTERVAL_MS)
        await sessionRepository.touch(db, row.id);
      return row;
    },

    csrfTokenFor,

    verifyCsrfToken: (sessionId, provided) =>
      safeEqual(provided, csrfTokenFor(sessionId)),

    async list(userId, currentSessionId) {
      const rows = await sessionRepository.listRecentForUser(db, userId);
      return rows.map((row) =>
        toSessionDto(row, { currentSessionId, idleMinutes }),
      );
    },

    revoke: (executor, { userId, sessionId, reason }) =>
      sessionRepository.revoke(executor, { userId, sessionId, reason }),

    revokeOthers: (executor, { userId, currentSessionId, reason }) =>
      sessionRepository.revokeAllForUserExcept(executor, {
        userId,
        exceptSessionId: currentSessionId,
        reason,
      }),

    async revokeByToken(token, reason) {
      if (
        typeof token !== 'string' ||
        !token ||
        token.length > MAX_TOKEN_LENGTH
      )
        return;
      await sessionRepository.revokeByTokenHash(db, sha256(token), reason);
    },
  };
}
