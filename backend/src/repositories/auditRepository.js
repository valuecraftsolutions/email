export const auditRepository = {
  async insert(q, entry) {
    await q.query(
      `INSERT INTO audit_logs (actor_user_id, action, resource_type, resource_id,
         outcome, metadata, ip_address, user_agent, request_id)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::inet, $8, $9)`,
      [
        entry.actorUserId ?? null,
        entry.action,
        entry.resourceType ?? null,
        entry.resourceId == null ? null : String(entry.resourceId),
        entry.outcome ?? 'SUCCESS',
        JSON.stringify(entry.metadata ?? {}),
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
        entry.requestId ?? null,
      ],
    );
  },
};
