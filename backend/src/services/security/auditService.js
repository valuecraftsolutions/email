import { auditRepository } from '../../repositories/auditRepository.js';
import { normalizeIp, normalizeUserAgent } from '../../utils/clientInfo.js';

const SENSITIVE_KEY =
  /pass(word|wd)?|secret|token|authori[sz]ation|cookie|credential|api[-_]?key|hash|otp|mfa_code/i;
const MAX_DEPTH = 4;
const MAX_STRING = 500;
const MAX_ITEMS = 50;

/**
 * Removes credential-like keys and bounds size so audit metadata can never
 * carry passwords, tokens or unbounded user input.
 */
export function sanitizeAuditMetadata(value, depth = 0) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number')
    return value ?? null;
  if (typeof value === 'string') return value.slice(0, MAX_STRING);
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value))
    return value
      .slice(0, MAX_ITEMS)
      .map((item) => sanitizeAuditMetadata(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_ITEMS)) {
      if (SENSITIVE_KEY.test(key)) continue;
      out[key] = sanitizeAuditMetadata(item, depth + 1);
    }
    return out;
  }
  return null;
}

export function createAuditService({ db, logger }) {
  const record = (entry, executor = db) =>
    auditRepository.insert(executor, {
      actorUserId: entry.actorUserId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      outcome: entry.outcome,
      metadata: sanitizeAuditMetadata(entry.metadata ?? {}),
      ipAddress: normalizeIp(entry.context?.ip),
      userAgent: normalizeUserAgent(entry.context?.userAgent),
      requestId: entry.context?.requestId,
    });

  return {
    /** Writes within the caller's executor; failures propagate (use inside transactions). */
    record,
    /** Best-effort write for events outside a transaction; failures are logged, not thrown. */
    async recordSafely(entry) {
      try {
        await record(entry);
      } catch (error) {
        logger.error(
          { err: error, action: entry.action },
          'Failed to write audit log',
        );
      }
    },
  };
}
