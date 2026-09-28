import { rbacRepository } from '../../repositories/rbacRepository.js';

export function createRbacService({ db }) {
  return {
    getUserAccess: (userId, executor = db) =>
      rbacRepository.getUserAccess(executor, userId),

    async listRoles() {
      const rows = await rbacRepository.listRoles(db);
      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        isSystem: r.is_system,
        userCount: r.user_count,
        permissions: r.permissions,
      }));
    },

    async listPermissions() {
      const rows = await rbacRepository.listPermissions(db);
      return rows.map((p) => ({
        id: p.id,
        code: p.code,
        module: p.module,
        name: p.name,
        description: p.description,
      }));
    },
  };
}
