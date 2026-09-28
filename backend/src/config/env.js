import { z } from 'zod';

const bool = (fallback) =>
  z
    .enum(['true', 'false'])
    .default(fallback ? 'true' : 'false')
    .transform((value) => value === 'true');

const int = (fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const PLACEHOLDER = /^(replace|change|your-|xxx)/i;

const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: int(4600, { max: 65535 }),
    APP_ORIGIN: z.url().default('http://localhost:4601'),
    CORS_ORIGINS: z.string().optional(),
    TRUST_PROXY: int(0, { min: 0, max: 10 }),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.string().optional(),
    DB_HOST: z.string().optional(),
    DB_PORT: int(5432, { max: 65535 }),
    DB_NAME: z.string().optional(),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().optional(),
    DB_SSL: bool(false),
    DB_SSL_CA_PATH: z.string().optional(),
    DB_POOL_MAX: int(10, { max: 100 }),
    DB_STATEMENT_TIMEOUT_MS: int(15000),

    SESSION_SECRET: z
      .string({ error: 'SESSION_SECRET is required' })
      .min(32, 'SESSION_SECRET must be at least 32 characters'),
    SESSION_TTL_HOURS: int(12, { max: 720 }),
    SESSION_IDLE_MINUTES: int(60, { max: 1440 }),
    COOKIE_SECURE: z.enum(['true', 'false']).optional(),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict']).default('lax'),

    ARGON2_MEMORY_KIB: int(65536, { min: 1024, max: 1048576 }),
    ARGON2_TIME_COST: int(3, { max: 10 }),

    LOGIN_RATE_LIMIT_MAX: int(10, { max: 10000 }),
    LOGIN_RATE_LIMIT_WINDOW_MINUTES: int(15, { max: 1440 }),
    API_RATE_LIMIT_PER_MINUTE: int(600, { max: 100000 }),
    ACCOUNT_LOCKOUT_THRESHOLD: int(5, { max: 100 }),
    ACCOUNT_LOCKOUT_MINUTES: int(15, { max: 1440 }),

    MAILBOX_ENCRYPTION_KEY: z.string().optional(),
    MAILBOX_ENCRYPTION_KEY_ID: z
      .string()
      .regex(/^[a-z0-9]{1,16}$/, 'Use 1-16 lowercase letters or digits')
      .default('k1'),

    MAIL_PROVIDER: z.enum(['hostinger']).default('hostinger'),
    // Hostinger defaults: https://docs.hostinger.com/emails/setup-devices
    IMAP_HOST: z.string().default('imap.hostinger.com'),
    IMAP_PORT: int(993, { max: 65535 }),
    IMAP_SECURE: bool(true),
    SMTP_HOST: z.string().default('smtp.hostinger.com'),
    SMTP_PORT: int(465, { max: 65535 }),
    SMTP_SECURE: bool(true),
    MAIL_CONNECTION_TIMEOUT_MS: int(15000, { min: 1000, max: 120000 }),
    MAIL_ALLOWED_DOMAINS: z.string().default('valuecraftminds.com'),
    // Plain SMTP submission does not store a copy; append one to the Sent folder.
    MAIL_SAVE_SENT_COPY: bool(true),
    MAIL_MAX_RECIPIENTS: int(100, { max: 1000 }),
    MAIL_SEND_RATE_PER_MINUTE: int(20, { max: 1000 }),
    // Keep at or below the attachment limit of the Hostinger mail plan.
    MAIL_MAX_ATTACHMENT_MB: int(25, { max: 100 }),
    MAIL_MAX_ATTACHMENTS: int(20, { max: 100 }),
    MAIL_BLOCKED_EXTENSIONS: z
      .string()
      .default(
        'exe,bat,cmd,com,scr,pif,cpl,msi,msp,msc,vbs,vbe,js,jse,wsf,wsh,ps1,psm1,hta,jar,lnk,reg,dll,sys,scf,inf,iso,img,vhd,vhdx,appx,msix',
      ),
  })
  .superRefine((env, ctx) => {
    const issue = (path, message) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (!env.DATABASE_URL && !(env.DB_HOST && env.DB_NAME && env.DB_USER))
      issue('DATABASE_URL', 'Set DATABASE_URL or DB_HOST, DB_NAME and DB_USER');
    if (PLACEHOLDER.test(env.SESSION_SECRET))
      issue('SESSION_SECRET', 'Replace the placeholder with a random secret');
    if (env.MAILBOX_ENCRYPTION_KEY) {
      if (Buffer.from(env.MAILBOX_ENCRYPTION_KEY, 'base64').length !== 32)
        issue(
          'MAILBOX_ENCRYPTION_KEY',
          'Must be 32 random bytes encoded as base64',
        );
    }
    if (env.NODE_ENV === 'production') {
      if (!env.MAILBOX_ENCRYPTION_KEY)
        issue('MAILBOX_ENCRYPTION_KEY', 'Required in production');
      if (!env.APP_ORIGIN.startsWith('https://'))
        issue('APP_ORIGIN', 'Must use https:// in production');
      if (env.COOKIE_SECURE === 'false')
        issue('COOKIE_SECURE', 'Secure cookies are mandatory in production');
    }
  });

/**
 * Parses and validates environment variables into a frozen config object.
 * Error messages name the variable but never echo its value.
 */
export function loadConfig(source = process.env) {
  const input = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  const cookieSecure = e.COOKIE_SECURE
    ? e.COOKIE_SECURE === 'true'
    : isProduction;
  const appOrigin = new URL(e.APP_ORIGIN).origin;
  const corsOrigins = [
    ...new Set([
      appOrigin,
      ...(e.CORS_ORIGINS ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
        .map((o) => new URL(o).origin),
    ]),
  ];

  return Object.freeze({
    env: e.NODE_ENV,
    isProduction,
    isTest: e.NODE_ENV === 'test',
    server: { host: e.HOST, port: e.PORT },
    appOrigin,
    corsOrigins,
    trustProxy: e.TRUST_PROXY,
    logLevel: e.LOG_LEVEL,
    database: {
      connectionString: e.DATABASE_URL,
      host: e.DB_HOST,
      port: e.DB_PORT,
      database: e.DB_NAME,
      user: e.DB_USER,
      password: e.DB_PASSWORD,
      ssl: e.DB_SSL,
      sslCaPath: e.DB_SSL_CA_PATH,
      poolMax: e.DB_POOL_MAX,
      statementTimeoutMs: e.DB_STATEMENT_TIMEOUT_MS,
    },
    session: {
      secret: e.SESSION_SECRET,
      ttlHours: e.SESSION_TTL_HOURS,
      idleMinutes: e.SESSION_IDLE_MINUTES,
      // The __Host- prefix forces Secure, Path=/ and no Domain attribute.
      cookieName: cookieSecure ? '__Host-vcm_session' : 'vcm_session',
      cookieSecure,
      cookieSameSite: e.COOKIE_SAME_SITE,
    },
    passwordHashing: {
      memoryCost: e.ARGON2_MEMORY_KIB,
      timeCost: e.ARGON2_TIME_COST,
    },
    security: {
      loginRateLimit: {
        max: e.LOGIN_RATE_LIMIT_MAX,
        windowMs: e.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000,
      },
      apiRateLimit: { max: e.API_RATE_LIMIT_PER_MINUTE, windowMs: 60_000 },
      lockout: {
        threshold: e.ACCOUNT_LOCKOUT_THRESHOLD,
        minutes: e.ACCOUNT_LOCKOUT_MINUTES,
      },
    },
    encryption: {
      key: e.MAILBOX_ENCRYPTION_KEY
        ? Buffer.from(e.MAILBOX_ENCRYPTION_KEY, 'base64')
        : null,
      keyId: e.MAILBOX_ENCRYPTION_KEY_ID,
    },
    mail: {
      provider: e.MAIL_PROVIDER,
      imap: { host: e.IMAP_HOST, port: e.IMAP_PORT, secure: e.IMAP_SECURE },
      smtp: { host: e.SMTP_HOST, port: e.SMTP_PORT, secure: e.SMTP_SECURE },
      connectionTimeoutMs: e.MAIL_CONNECTION_TIMEOUT_MS,
      allowedDomains: e.MAIL_ALLOWED_DOMAINS.split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
      saveSentCopy: e.MAIL_SAVE_SENT_COPY,
      maxRecipients: e.MAIL_MAX_RECIPIENTS,
      sendRatePerMinute: e.MAIL_SEND_RATE_PER_MINUTE,
      maxAttachmentBytes: e.MAIL_MAX_ATTACHMENT_MB * 1024 * 1024,
      maxAttachments: e.MAIL_MAX_ATTACHMENTS,
      blockedExtensions: e.MAIL_BLOCKED_EXTENSIONS.split(',')
        .map((x) => x.trim().toLowerCase().replace(/^\./, ''))
        .filter(Boolean),
    },
  });
}

/** For CLI entry points: print the validation problems and exit instead of throwing. */
export function loadConfigOrExit(source = process.env) {
  try {
    return loadConfig(source);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
