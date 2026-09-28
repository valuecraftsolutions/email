/** Derives a display status for a session row. Token hashes are never exposed. */
export function sessionStatus(row, idleMinutes, now = Date.now()) {
  if (row.revoked_at)
    return row.revoke_reason === 'LOGOUT' ? 'SIGNED_OUT' : 'REVOKED';
  if (new Date(row.expires_at).getTime() <= now) return 'EXPIRED';
  if (new Date(row.last_seen_at).getTime() <= now - idleMinutes * 60_000)
    return 'EXPIRED';
  return 'ACTIVE';
}

export const toSessionDto = (row, { currentSessionId, idleMinutes }) => ({
  id: row.id,
  current: row.id === currentSessionId,
  userAgent: row.user_agent ?? null,
  ipAddress: row.ip_address ?? null,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
  expiresAt: row.expires_at,
  endedAt: row.revoked_at ?? null,
  status: sessionStatus(row, idleMinutes),
});
