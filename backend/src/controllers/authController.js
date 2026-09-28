import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from '../utils/cookies.js';
import { sendSuccess } from '../utils/response.js';

const currentUserPayload = (auth, sessionService) => ({
  user: auth.user,
  roles: auth.roles,
  permissions: [...auth.permissions].sort(),
  csrfToken: sessionService.csrfTokenFor(auth.sessionId),
  session: { id: auth.sessionId, expiresAt: auth.sessionExpiresAt },
});

export function createAuthController({ config, authService, sessionService }) {
  return {
    async login(req, res) {
      const previousToken = readSessionCookie(req, config);
      const result = await authService.login(req.body, req.context);
      // A new token is always issued; any session already on this browser is ended.
      if (previousToken)
        await sessionService.revokeByToken(previousToken, 'LOGOUT');
      setSessionCookie(res, config, result.token, result.session.expires_at);
      sendSuccess(res, {
        user: result.user,
        roles: result.roles,
        permissions: result.permissions,
        csrfToken: result.csrfToken,
        session: {
          id: result.session.id,
          expiresAt: result.session.expires_at,
        },
      });
    },

    me(req, res) {
      sendSuccess(res, currentUserPayload(req.auth, sessionService));
    },

    async logout(req, res) {
      await authService.logout(req.auth, req.context);
      clearSessionCookie(res, config);
      sendSuccess(res, { signedOut: true });
    },

    async listSessions(req, res) {
      const sessions = await sessionService.list(
        req.auth.userId,
        req.auth.sessionId,
      );
      sendSuccess(res, { sessions });
    },

    async revokeSession(req, res) {
      const { sessionId } = req.valid.params;
      await authService.revokeSession(req.auth, sessionId, req.context);
      const current = sessionId === req.auth.sessionId;
      if (current) clearSessionCookie(res, config);
      sendSuccess(res, { revoked: true, signedOut: current });
    },

    async revokeOtherSessions(req, res) {
      const count = await authService.revokeOtherSessions(
        req.auth,
        req.context,
      );
      sendSuccess(res, { revokedSessions: count });
    },

    async changePassword(req, res) {
      const result = await authService.changePassword(
        req.auth,
        req.body,
        req.context,
      );
      sendSuccess(res, result);
    },
  };
}
