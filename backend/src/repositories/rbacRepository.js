export const rbacRepository = {
  async getUserAccess(q, userId) {
    const { rows } = await q.query(
      `SELECT r.code AS role_code, p.code AS permission_code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = $1`,
      [userId],
    );
    const roles = new Set();
    const permissions = new Set();
    for (const row of rows) {
      roles.add(row.role_code);
      if (row.permission_code) permissions.add(row.permission_code);
    }
    return { roles: [...roles].sort(), permissions: [...permissions].sort() };
  },

  async listRoles(q) {
    const { rows } = await q.query(
      `SELECT r.id, r.code, r.name, r.description, r.is_system,
         coalesce(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions,
         (SELECT count(*)::int FROM user_roles ur WHERE ur.role_id = r.id) AS user_count
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       GROUP BY r.id
       ORDER BY r.is_system DESC, count(p.id) DESC, r.code`,
    );
    return rows;
  },

  async listPermissions(q) {
    const { rows } = await q.query(
      `SELECT id, code, module, name, description
       FROM permissions ORDER BY module, sort_order, code`,
    );
    return rows;
  },

  async assignRoleByCode(q, userId, roleCode, assignedBy = null) {
    const { rowCount } = await q.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by)
       SELECT $1, id, $3 FROM roles WHERE code = $2
       ON CONFLICT DO NOTHING`,
      [userId, roleCode, assignedBy],
    );
    return rowCount > 0;
  },
};
