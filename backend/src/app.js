import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createAuthController } from './controllers/authController.js';
import { createHealthController } from './controllers/healthController.js';
import { createMailboxController } from './controllers/mailboxController.js';
import { createMailController } from './controllers/mailController.js';
import { createContactController } from './controllers/contactController.js';
import {
  createPreferenceController,
  createSignatureController,
} from './controllers/productivityController.js';
import { createRbacController } from './controllers/rbacController.js';
import { createAuthenticate } from './middleware/authenticate.js';
import { createComposeUpload } from './middleware/composeUpload.js';
import { createCsrfProtection } from './middleware/csrf.js';
import {
  createErrorHandler,
  notFoundHandler,
} from './middleware/errorHandler.js';
import {
  createApiLimiter,
  createLoginLimiter,
  createMailboxConnectLimiter,
  createSendLimiter,
} from './middleware/rateLimiters.js';
import { requestContext } from './middleware/requestContext.js';
import { createRequestGuards } from './middleware/requestGuards.js';
import { createRequestLogger } from './middleware/requestLogger.js';
import { createApiRouter } from './routes/index.js';
import { createAuthService } from './services/auth/authService.js';
import { createPasswordService } from './services/auth/passwordService.js';
import { createRbacService } from './services/auth/rbacService.js';
import { createSessionService } from './services/auth/sessionService.js';
import { createContactService } from './services/contacts/contactService.js';
import { createMailboxService } from './services/mail/mailboxService.js';
import { createPreferenceService } from './services/preferences/preferenceService.js';
import { createSignatureService } from './services/signatures/signatureService.js';
import { createMailProviderFactory } from './services/mail/mailProviderRegistry.js';
import { createMailService } from './services/mail/mailService.js';
import { createAuditService } from './services/security/auditService.js';
import { createEncryptionService } from './services/security/encryptionService.js';

// Only mail compose endpoints accept large JSON bodies (HTML message content).
const LARGE_BODY_PATH = /^\/api\/mail\/(send|drafts)$/;

/**
 * Builds the Express app from injected dependencies (real Postgres in
 * production, PGlite in tests). Tests may inject a fake mailProviderFactory.
 */
export function createApp({ config, db, logger, mailProviderFactory }) {
  const passwordService = createPasswordService(config.passwordHashing);
  const auditService = createAuditService({ db, logger });
  const rbacService = createRbacService({ db });
  const sessionService = createSessionService({ db, config });
  const encryptionService = createEncryptionService(config.encryption);
  const providerFactory =
    mailProviderFactory ?? createMailProviderFactory({ config, logger });
  const mailService = createMailService({
    db,
    config,
    logger,
    encryptionService,
    auditService,
    providerFactory,
  });
  const mailboxService = createMailboxService({
    db,
    config,
    encryptionService,
    auditService,
    providerFactory,
  });
  const contactService = createContactService({ db });
  const signatureService = createSignatureService({ db, auditService });
  const preferenceService = createPreferenceService({ db, auditService });
  const authService = createAuthService({
    db,
    config,
    passwordService,
    sessionService,
    rbacService,
    auditService,
  });

  const deps = {
    db,
    config,
    logger,
    authenticate: createAuthenticate({
      db,
      config,
      sessionService,
      rbacService,
    }),
    csrf: createCsrfProtection({ sessionService }),
    loginLimiter: createLoginLimiter(config),
    authController: createAuthController({
      config,
      authService,
      sessionService,
    }),
    rbacController: createRbacController({ rbacService }),
    healthController: createHealthController({ db, logger }),
    sendLimiter: createSendLimiter(config),
    composeUpload: createComposeUpload(config),
    contactController: createContactController({ contactService }),
    signatureController: createSignatureController({ signatureService }),
    preferenceController: createPreferenceController({ preferenceService }),
    mailboxConnectLimiter: createMailboxConnectLimiter(),
    mailController: createMailController({ mailService }),
    mailboxController: createMailboxController({ mailboxService, mailService }),
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(requestContext);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || config.corsOrigins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
      maxAge: 600,
    }),
  );
  app.use(createRequestLogger(logger));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', createApiLimiter(config));
  app.use(createRequestGuards(config));
  const smallJson = express.json({ limit: '100kb', strict: true });
  const largeJson = express.json({ limit: '5mb', strict: true });
  app.use((req, res, next) =>
    (LARGE_BODY_PATH.test(req.path) ? largeJson : smallJson)(req, res, next),
  );
  app.use(cookieParser());

  app.use('/api', createApiRouter(deps));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  app.locals.services = {
    passwordService,
    auditService,
    rbacService,
    sessionService,
    encryptionService,
    authService,
    mailService,
    mailboxService,
    providerFactory,
  };
  return app;
}
