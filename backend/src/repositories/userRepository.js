const PUBLIC_COLUMNS = `id, user_code, email, full_name, display_name, department,
  job_title, phone, status, mfa_enabled, last_login_at, created_at, updated_at`;

// Every function takes an executor (db or transaction) as its first argument.
export const userRepository = {
  async findAuthByEmail(q, email) {
    const { rows } = await q.query(
      `SELECT id, email, status, password_hash, failed_login_count, locked_until
       FROM users WHERE email = lower($1)`,
      [email],
    );
    return rows[0] ?? null;
  },

  async findById(q, id) {
    const { rows } = await q.query(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async findPasswordHash(q, id) {
    const { rows } = await q.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [id],
    );
    return rows[0]?.password_hash ?? null;
  },

  async create(q, user) {
    const { rows } = await q.query(
      `INSERT INTO users (email, full_name, display_name, department, job_title,
         phone, status, password_hash, password_changed_at, created_by)
       VALUES (lower($1), $2, $3, $4, $5, $6, $7, $8,
         CASE WHEN $8::text IS NULL THEN NULL ELSE now() END, $9)
       RETURNING ${PUBLIC_COLUMNS}`,
      [
        user.email,
        user.fullName,
        user.displayName ?? null,
        user.department ?? null,
        user.jobTitle ?? null,
        user.phone ?? null,
        user.status ?? 'PENDING',
        user.passwordHash ?? null,
        user.createdBy ?? null,
      ],
    );
    return rows[0];
  },

  /**
   * Increments the failure counter, restarting it once a previous lock has
   * expired, and locks the account when the threshold is reached.
   */
  async recordFailedLogin(q, id, { threshold, minutes }) {
    const { rows } = await q.query(
      `UPDATE users SET
         failed_login_count = CASE WHEN locked_until IS NOT NULL AND locked_until <= now()
                                   THEN 1 ELSE failed_login_count + 1 END,
         locked_until = CASE
           WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= now()
                      THEN 1 ELSE failed_login_count + 1 END) >= $2::int
             THEN now() + make_interval(mins => $3::int)
           WHEN locked_until <= now() THEN NULL
           ELSE locked_until END
       WHERE id = $1
       RETURNING failed_login_count, locked_until`,
      [id, threshold, minutes],
    );
    return rows[0] ?? null;
  },

  async recordSuccessfulLogin(q, id) {
    await q.query(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
       WHERE id = $1`,
      [id],
    );
  },

  /** Self-service profile fields only; identity and HR fields are admin-managed. */
  async updateProfile(q, id, { displayName, phone }) {
    const { rows } = await q.query(
      `UPDATE users SET
         display_name = CASE WHEN $2::boolean THEN $3 ELSE display_name END,
         phone = CASE WHEN $4::boolean THEN $5 ELSE phone END,
         updated_by = $1
       WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
      [
        id,
        displayName !== undefined,
        displayName ?? null,
        phone !== undefined,
        phone ?? null,
      ],
    );
    return rows[0];
  },

  /** `rotated` = true for a user-initiated change; false for a transparent rehash. */
  async updatePasswordHash(q, id, passwordHash, { rotated = true } = {}) {
    await q.query(
      `UPDATE users SET password_hash = $2,
         password_changed_at = CASE WHEN $3::boolean THEN now() ELSE password_changed_at END
       WHERE id = $1`,
      [id, passwordHash, rotated],
    );
  },
};
