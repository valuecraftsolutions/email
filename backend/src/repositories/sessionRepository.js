const SESSION_COLUMNS = `s.id, s.user_id, host(s.ip_address) AS ip_address, s.user_agent,
  s.created_at, s.last_seen_at, s.expires_at, s.revoked_at, s.revoke_reason`;

export const sessionRepository = {
  async create(q, { userId, tokenHash, ipAddress, userAgent, expiresAt }) {
    const { rows } = await q.query(
      `INSERT INTO sessions AS s (user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3::inet, $4, $5)
       RETURNING ${SESSION_COLUMNS}`,
      [userId, tokenHash, ipAddress, userAgent, expiresAt],
    );
    return rows[0];
  },

  /** Returns the session joined with its user, or null if revoked, expired or idle. */
  async findActiveByTokenHash(q, tokenHash, idleMinutes) {
    const { rows } = await q.query(
      `SELECT ${SESSION_COLUMNS},
         u.user_code, u.email, u.full_name, u.display_name, u.department, u.job_title,
         u.phone, u.status AS user_status, u.mfa_enabled, u.last_login_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
         AND s.last_seen_at > now() - make_interval(mins => $2::int)`,
      [tokenHash, idleMinutes],
    );
    return rows[0] ?? null;
  },

  async touch(q, id) {
    await q.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [
      id,
    ]);
  },

  async listRecentForUser(q, userId, { days = 30, limit = 50 } = {}) {
    const { rows } = await q.query(
      `SELECT ${SESSION_COLUMNS} FROM sessions s
       WHERE s.user_id = $1 AND s.created_at > now() - make_interval(days => $2::int)
       ORDER BY (s.revoked_at IS NULL AND s.expires_at > now()) DESC, s.last_seen_at DESC
       LIMIT $3`,
      [userId, days, limit],
    );
    return rows;
  },

  async revoke(q, { userId, sessionId, reason }) {
    const { rowCount } = await q.query(
      `UPDATE sessions SET revoked_at = now(), revoke_reason = $3
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [sessionId, userId, reason],
    );
    return rowCount > 0;
  },

  async revokeByTokenHash(q, tokenHash, reason) {
    await q.query(
      `UPDATE sessions SET revoked_at = now(), revoke_reason = $2
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash, reason],
    );
  },

  async revokeAllForUserExcept(q, { userId, exceptSessionId, reason }) {
    const { rowCount } = await q.query(
      `UPDATE sessions SET revoked_at = now(), revoke_reason = $3
       WHERE user_id = $1 AND id IS DISTINCT FROM $2::uuid
         AND revoked_at IS NULL AND expires_at > now()`,
      [userId, exceptSessionId ?? null, reason],
    );
    return rowCount;
  },

  async deleteEndedBefore(q, days) {
    const { rowCount } = await q.query(
      `DELETE FROM sessions
       WHERE expires_at < now() - make_interval(days => $1::int)
          OR revoked_at < now() - make_interval(days => $1::int)`,
      [days],
    );
    return rowCount;
  },
};
