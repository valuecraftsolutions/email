import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  changePasswordSchema,
  loginSchema,
  sessionIdParamsSchema,
} from '../validators/authValidators.js';

export function createAuthRoutes({
  authController: c,
  authenticate,
  csrf,
  loginLimiter,
}) {
  const router = Router();

  router.post('/login', loginLimiter, validate({ body: loginSchema }), c.login);

  // Everything below requires a valid session and, for writes, a CSRF token.
  router.use(authenticate, csrf);
  router.get('/me', c.me);
  router.post('/logout', c.logout);
  router.get('/sessions', c.listSessions);
  router.post('/sessions/revoke-others', c.revokeOtherSessions);
  router.delete(
    '/sessions/:sessionId',
    validate({ params: sessionIdParamsSchema }),
    c.revokeSession,
  );
  router.post(
    '/password',
    validate({ body: changePasswordSchema }),
    c.changePassword,
  );

  return router;
}
