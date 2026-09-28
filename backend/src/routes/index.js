import { Router } from 'express';
import { createAuthRoutes } from './authRoutes.js';
import { createHealthRoutes } from './healthRoutes.js';
import { createMailboxRoutes } from './mailboxRoutes.js';
import { createMailRoutes } from './mailRoutes.js';
import {
  createContactRoutes,
  createPreferenceRoutes,
  createProfileRoutes,
  createSignatureRoutes,
} from './productivityRoutes.js';
import { createPermissionRoutes, createRoleRoutes } from './rbacRoutes.js';

/**
 * API surface. Phase 5 mounts /users, /mailboxes (admin), /audit-logs and
 * /settings here, each behind authenticate + csrf +
 * requirePermission.
 */
export function createApiRouter(deps) {
  const router = Router();
  router.use('/health', createHealthRoutes(deps));
  router.use('/auth', createAuthRoutes(deps));
  router.use('/roles', createRoleRoutes(deps));
  router.use('/permissions', createPermissionRoutes(deps));
  router.use('/mailboxes', createMailboxRoutes(deps));
  router.use('/mail', createMailRoutes(deps));
  router.use('/contacts', createContactRoutes(deps));
  router.use('/signatures', createSignatureRoutes(deps));
  router.use('/preferences', createPreferenceRoutes(deps));
  router.use('/profile', createProfileRoutes(deps));
  return router;
}
