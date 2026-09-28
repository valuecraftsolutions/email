import { sendSuccess } from '../utils/response.js';

export function createRbacController({ rbacService }) {
  return {
    async listRoles(req, res) {
      sendSuccess(res, { roles: await rbacService.listRoles() });
    },
    async listPermissions(req, res) {
      sendSuccess(res, { permissions: await rbacService.listPermissions() });
    },
  };
}
