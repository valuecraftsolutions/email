const COLUMNS = `theme, messages_per_page, reading_pane, density, timezone, locale,
  signature_mode, notification_settings, updated_at`;

const FIELD_COLUMNS = {
  theme: 'theme',
  messagesPerPage: 'messages_per_page',
  density: 'density',
  signatureMode: 'signature_mode',
};

export const preferenceRepository = {
  async find(q, userId) {
    const { rows } = await q.query(
      `SELECT ${COLUMNS} FROM user_preferences WHERE user_id = $1`,
      [userId],
    );
    return rows[0] ?? null;
  },

  /** Creates the row on first use; only provided fields are written. */
  async upsert(q, userId, fields) {
    const columns = [];
    const params = [userId];
    for (const [key, column] of Object.entries(FIELD_COLUMNS))
      if (fields[key] !== undefined) {
        params.push(fields[key]);
        columns.push([column, `$${params.length}`]);
      }
    if (!columns.length) return this.find(q, userId);
    const { rows } = await q.query(
      `INSERT INTO user_preferences (user_id, ${columns.map((c) => c[0]).join(', ')})
       VALUES ($1, ${columns.map((c) => c[1]).join(', ')})
       ON CONFLICT (user_id) DO UPDATE SET
         ${columns.map(([c]) => `${c} = EXCLUDED.${c}`).join(', ')}
       RETURNING ${COLUMNS}`,
      params,
    );
    return rows[0];
  },
};
