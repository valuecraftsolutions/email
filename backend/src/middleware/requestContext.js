import { randomUUID } from 'node:crypto';

/** Attaches a per-request id and client details used by logging and auditing. */
export function requestContext(req, res, next) {
  const requestId = randomUUID();
  req.context = {
    requestId,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? null,
  };
  res.set('X-Request-Id', requestId);
  next();
}
