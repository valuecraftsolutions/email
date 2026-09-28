import pino from 'pino';

// Anything that could carry a credential is censored before it reaches a log sink.
const REDACT_PATHS = [
  'password',
  '*.password',
  'currentPassword',
  '*.currentPassword',
  'newPassword',
  '*.newPassword',
  'token',
  '*.token',
  'secret',
  '*.secret',
  'apiToken',
  '*.apiToken',
  'headers.cookie',
  'headers.authorization',
  '*.headers.cookie',
  '*.headers.authorization',
  'headers["x-csrf-token"]',
  '*.headers["x-csrf-token"]',
];

export function createLogger({ logLevel = 'info' } = {}) {
  return pino({
    level: logLevel,
    base: { service: 'vcm-mail-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  });
}
