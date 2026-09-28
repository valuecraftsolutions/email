import { Router } from 'express';
import { requirePermission } from '../middleware/authorize.js';

export function createRoleRoutes({ rbacController, authenticate, csrf }) {
  const router = Router();
  router.use(authenticate, csrf);
  router.get('/', requirePermission('roles.read'), rbacController.listRoles);
  return router;
}

export function createPermissionRoutes({ rbacController, authenticate, csrf }) {
  const router = Router();
  router.use(authenticate, csrf);
  router.get(
    '/',
    requirePermission('roles.read'),
    rbacController.listPermissions,
  );
  return router;
}
