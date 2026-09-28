/** Maps a users row (or a row with the same column names) to the public API shape. */
export const toPublicUser = (row) => ({
  id: row.id,
  userCode: row.user_code,
  email: row.email,
  fullName: row.full_name,
  displayName: row.display_name ?? null,
  department: row.department ?? null,
  jobTitle: row.job_title ?? null,
  phone: row.phone ?? null,
  status: row.status,
  mfaEnabled: Boolean(row.mfa_enabled),
  lastLoginAt: row.last_login_at ?? null,
});
