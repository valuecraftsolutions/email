export const settingsRepository = {
  /** Returns the JSON value of a non-secret setting, or the fallback. */
  async getValue(q, key, fallback = null) {
    const { rows } = await q.query(
      'SELECT value FROM system_settings WHERE key = $1 AND NOT is_secret',
      [key],
    );
    return rows[0]?.value ?? fallback;
  },
};
