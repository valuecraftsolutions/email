const MAILBOX_COLUMNS = `m.id, m.email_address, m.display_name, m.provider, m.status,
  m.connection_status, m.credentials_updated_at, m.last_connected_at,
  m.last_error_code, m.last_error_at, m.created_at, m.updated_at,
  (m.credentials_encrypted IS NOT NULL) AS has_credentials`;

export const mailboxRepository = {
  async listForUser(q, userId) {
    const { rows } = await q.query(
      `SELECT ${MAILBOX_COLUMNS}, um.access_level, um.is_primary
       FROM user_mailboxes um JOIN mailboxes m ON m.id = um.mailbox_id
       WHERE um.user_id = $1
       ORDER BY um.is_primary DESC, m.email_address`,
      [userId],
    );
    return rows;
  },

  /** The user's primary mailbox including the encrypted credential blob. */
  async findPrimaryWithCredentials(q, userId) {
    const { rows } = await q.query(
      `SELECT ${MAILBOX_COLUMNS}, m.credentials_encrypted
       FROM user_mailboxes um JOIN mailboxes m ON m.id = um.mailbox_id
       WHERE um.user_id = $1
       ORDER BY um.is_primary DESC, um.assigned_at
       LIMIT 1`,
      [userId],
    );
    return rows[0] ?? null;
  },

  async findByEmail(q, emailAddress) {
    const { rows } = await q.query(
      `SELECT ${MAILBOX_COLUMNS},
         (SELECT um.user_id FROM user_mailboxes um
          WHERE um.mailbox_id = m.id AND um.access_level = 'OWNER') AS owner_user_id
       FROM mailboxes m WHERE m.email_address = lower($1)`,
      [emailAddress],
    );
    return rows[0] ?? null;
  },

  async create(q, { emailAddress, displayName, provider, createdBy }) {
    const { rows } = await q.query(
      `INSERT INTO mailboxes AS m (email_address, display_name, provider, created_by, updated_by)
       VALUES (lower($1), $2, $3, $4, $4)
       RETURNING ${MAILBOX_COLUMNS}`,
      [emailAddress, displayName ?? null, provider, createdBy ?? null],
    );
    return rows[0];
  },

  async setCredentials(q, id, { credentialsEncrypted, updatedBy }) {
    await q.query(
      `UPDATE mailboxes SET credentials_encrypted = $2, credentials_updated_at = now(),
         connection_status = 'CONNECTED', last_connected_at = now(),
         last_error_code = NULL, last_error_at = NULL, updated_by = $3
       WHERE id = $1`,
      [id, credentialsEncrypted, updatedBy ?? null],
    );
  },

  async clearCredentials(q, id, updatedBy) {
    await q.query(
      `UPDATE mailboxes SET credentials_encrypted = NULL, credentials_updated_at = now(),
         connection_status = 'UNKNOWN', updated_by = $2
       WHERE id = $1`,
      [id, updatedBy ?? null],
    );
  },

  async assignOwner(q, { userId, mailboxId, assignedBy }) {
    await q.query(
      `INSERT INTO user_mailboxes (user_id, mailbox_id, access_level, is_primary, assigned_by)
       VALUES ($1, $2, 'OWNER',
         NOT EXISTS (SELECT 1 FROM user_mailboxes WHERE user_id = $1 AND is_primary), $3)
       ON CONFLICT (user_id, mailbox_id) DO NOTHING`,
      [userId, mailboxId, assignedBy ?? null],
    );
  },

  async markConnected(q, id) {
    await q.query(
      `UPDATE mailboxes SET connection_status = 'CONNECTED', last_connected_at = now(),
         last_error_code = NULL, last_error_at = NULL
       WHERE id = $1`,
      [id],
    );
  },

  async markFailed(q, id, errorCode) {
    await q.query(
      `UPDATE mailboxes SET connection_status = 'FAILED', last_error_code = $2,
         last_error_at = now()
       WHERE id = $1`,
      [id, errorCode],
    );
  },
};
