import { toPublicUser } from '../models/userModel.js';
import { clearSessionCookie, readSessionCookie } from '../utils/cookies.js';
import { unauthenticated } from '../utils/errors.js';

/**
 * Resolves the session cookie, verifies the user is still ACTIVE and loads
 * permissions from the database on every request. Sets req.auth.
 */
export function createAuthenticate({
  db,
  config,
  sessionService,
  rbacService,
}) {
  return async function authenticate(req, res, next) {
    const token = readSessionCookie(req, config);
    const row = token ? await sessionService.resolve(token) : null;
    if (!row) {
      if (token) clearSessionCookie(res, config);
      throw unauthenticated();
    }
    if (row.user_status !== 'ACTIVE') {
      await sessionService.revoke(db, {
        userId: row.user_id,
        sessionId: row.id,
        reason: 'ACCOUNT_DISABLED',
      });
      clearSessionCookie(res, config);
      throw unauthenticated();
    }
    const access = await rbacService.getUserAccess(row.user_id);
    req.auth = {
      userId: row.user_id,
      sessionId: row.id,
      sessionExpiresAt: row.expires_at,
      user: toPublicUser({ ...row, id: row.user_id, status: row.user_status }),
      roles: access.roles,
      permissions: new Set(access.permissions),
    };
    next();
  };
}
