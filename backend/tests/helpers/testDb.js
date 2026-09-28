import { PGlite } from '@electric-sql/pglite';
import { runMigrations } from '../../src/db/migrator.js';

// Adapts PGlite (in-process PostgreSQL) to the executor contract used by repositories.
const wrap = (target) => {
  const executor = {
    async query(text, params) {
      const result = await target.query(text, params);
      return {
        rows: result.rows,
        rowCount: result.affectedRows ?? result.rows.length,
      };
    },
    exec: (sql) => target.exec(sql),
    transaction: (work) => work(executor),
  };
  return executor;
};

export async function createTestDatabase({ migrate = true } = {}) {
  const pg = await PGlite.create();
  const db = {
    ...wrap(pg),
    transaction: (work) => pg.transaction((tx) => work(wrap(tx))),
    close: () => pg.close(),
  };
  if (migrate) await runMigrations(db);
  return db;
}
