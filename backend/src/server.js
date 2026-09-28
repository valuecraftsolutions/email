import './config/loadEnv.js';
import { createApp } from './app.js';
import { loadConfigOrExit } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createPostgresDatabase } from './db/database.js';
import { startSessionCleanupJob } from './jobs/sessionCleanupJob.js';

const config = loadConfigOrExit();

const logger = createLogger(config);
const db = createPostgresDatabase(config.database, logger);
const app = createApp({ config, db, logger });

// Express 5 passes listen failures (e.g. EADDRINUSE) to this callback instead of throwing.
const server = app.listen(config.server.port, config.server.host, (error) => {
  if (error) {
    logger.fatal(
      { code: error.code, port: config.server.port },
      'API could not start listening',
    );
    process.exit(1);
  }
  logger.info(
    { host: config.server.host, port: config.server.port, env: config.env },
    'ValueCraft Mail API listening',
  );
});
const stopJobs = startSessionCleanupJob({ db, logger });

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  stopJobs();
  app.locals.services.providerFactory.close();
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    await db.close().catch(() => {});
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) =>
  logger.error({ err: reason }, 'Unhandled promise rejection'),
);
