import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
);

const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;
const LOCK_KEY = 72710501;

// Normalise line endings so a checkout on Windows and Linux yields the same checksum.
const checksum = (sql) =>
  createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

/**
 * Applies pending SQL migrations in filename order inside one transaction.
 * Already-applied migrations must not be edited: a checksum mismatch aborts the run.
 */
export async function runMigrations(
  db,
  { directory = MIGRATIONS_DIR, logger } = {},
) {
  const files = (await readdir(directory))
    .filter((name) => MIGRATION_FILE.test(name))
    .sort();

  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
    await tx.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await tx.query(
      'SELECT name, checksum FROM schema_migrations',
    );
    const applied = new Map(rows.map((r) => [r.name, r.checksum]));
    const appliedNow = [];

    for (const name of files) {
      const sql = await readFile(path.join(directory, name), 'utf8');
      const sum = checksum(sql);
      if (applied.has(name)) {
        if (applied.get(name) !== sum)
          throw new Error(
            `Migration ${name} was modified after being applied. Create a new migration instead.`,
          );
        continue;
      }
      await tx.exec(sql);
      await tx.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
        [name, sum],
      );
      appliedNow.push(name);
      logger?.info?.({ migration: name }, 'Applied migration');
    }
    return appliedNow;
  });
}
