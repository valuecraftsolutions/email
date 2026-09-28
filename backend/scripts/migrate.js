import '../src/config/loadEnv.js';
import { loadConfigOrExit } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { createPostgresDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrator.js';

const config = loadConfigOrExit();
const logger = createLogger(config);
const db = createPostgresDatabase(config.database, logger);

try {
  const applied = await runMigrations(db, { logger });
  console.log(
    applied.length
      ? `Applied ${applied.length} migration(s): ${applied.join(', ')}`
      : 'Database is up to date.',
  );
} catch (error) {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
