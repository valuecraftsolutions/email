const COLUMNS = 'id, scope, user_id, name, body_html, is_default, updated_at';

export const signatureRepository = {
  async findCompanyDefault(q) {
    const { rows } = await q.query(
      `SELECT ${COLUMNS} FROM email_signatures
       WHERE scope = 'COMPANY' AND is_default AND is_active`,
    );
    return rows[0] ?? null;
  },

  async saveCompanyDefault(q, bodyHtml, userId) {
    const { rows } = await q.query(
      `UPDATE email_signatures SET body_html = $1, updated_by = $2, is_active = true
       WHERE scope = 'COMPANY' AND is_default RETURNING ${COLUMNS}`,
      [bodyHtml, userId],
    );
    if (rows[0]) return rows[0];
    const inserted = await q.query(
      `INSERT INTO email_signatures (scope, name, body_html, is_default, created_by, updated_by)
       VALUES ('COMPANY', 'Company signature', $1, true, $2, $2) RETURNING ${COLUMNS}`,
      [bodyHtml, userId],
    );
    return inserted.rows[0];
  },

  async findUserDefault(q, userId) {
    const { rows } = await q.query(
      `SELECT ${COLUMNS} FROM email_signatures
       WHERE scope = 'USER' AND user_id = $1 AND is_default`,
      [userId],
    );
    return rows[0] ?? null;
  },

  async saveUserDefault(q, userId, bodyHtml) {
    const { rows } = await q.query(
      `UPDATE email_signatures SET body_html = $2, updated_by = $1
       WHERE scope = 'USER' AND user_id = $1 AND is_default RETURNING ${COLUMNS}`,
      [userId, bodyHtml],
    );
    if (rows[0]) return rows[0];
    const inserted = await q.query(
      `INSERT INTO email_signatures (scope, user_id, name, body_html, is_default, created_by, updated_by)
       VALUES ('USER', $1, 'My signature', $2, true, $1, $1) RETURNING ${COLUMNS}`,
      [userId, bodyHtml],
    );
    return inserted.rows[0];
  },
};
