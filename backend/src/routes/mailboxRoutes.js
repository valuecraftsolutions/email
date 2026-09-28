import { Router } from 'express';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { connectMailboxBody } from '../validators/mailValidators.js';

/** Self-service routes for the signed-in user's own mailbox. Admin mailbox management is Phase 5. */
export function createMailboxRoutes({
  mailboxController: c,
  authenticate,
  csrf,
  mailboxConnectLimiter,
}) {
  const router = Router();
  router.use(authenticate, csrf, requirePermission('mail.read_own'));
  router.get('/me', c.listMine);
  router.post(
    '/me/connect',
    mailboxConnectLimiter,
    validate({ body: connectMailboxBody }),
    c.connect,
  );
  router.post('/me/test', c.test);
  router.delete('/me', c.disconnect);
  return router;
}
