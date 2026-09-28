import { AppError, unauthenticated } from '../utils/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Synchronizer-token CSRF protection for authenticated, state-changing requests.
 * The token is an HMAC of the session id, delivered in the /auth/me and login
 * responses (never in a readable cookie) and sent back in X-CSRF-Token.
 */
export function createCsrfProtection({ sessionService }) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (!req.auth) return next(unauthenticated());
    if (
      !sessionService.verifyCsrfToken(
        req.auth.sessionId,
        req.get('x-csrf-token'),
      )
    )
      return next(
        new AppError(
          403,
          'CSRF_TOKEN_INVALID',
          'Your request could not be verified. Refresh the page and try again.',
        ),
      );
    next();
  };
}
