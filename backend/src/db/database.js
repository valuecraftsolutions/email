import { readFileSync } from 'node:fs';
import pg from 'pg';

/**
 * Database executor contract used across repositories:
 *   query(text, params) -> { rows, rowCount }
 *   exec(sql)            -> runs multi-statement SQL (migrations)
 *   transaction(work)    -> runs work(executor) inside BEGIN/COMMIT
 * Nested transaction() calls reuse the outer transaction.
 */
export function createPostgresDatabase(options, logger) {
  const pool = new pg.Pool({
    ...(options.connectionString
      ? { connectionString: options.connectionString }
      : {
          host: options.host,
          port: options.port,
          database: options.database,
          user: options.user,
          password: options.password,
        }),
    ssl: options.ssl
      ? {
          rejectUnauthorized: true,
          ...(options.sslCaPath
            ? { ca: readFileSync(options.sslCaPath, 'utf8') }
            : {}),
        }
      : false,
    max: options.poolMax,
    statement_timeout: options.statementTimeoutMs,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'vcm-mail-api',
  });
  pool.on('error', (error) =>
    logger?.error({ code: error.code }, 'PostgreSQL idle client error'),
  );

  const wrapClient = (client) => {
    const executor = {
      query: (text, params) => client.query(text, params),
      exec: (sql) => client.query(sql),
      transaction: (work) => work(executor),
    };
    return executor;
  };

  return {
    query: (text, params) => pool.query(text, params),
    exec: (sql) => pool.query(sql),
    async transaction(work) {
      const client = await pool.connect();
      let broken = false;
      try {
        await client.query('BEGIN');
        const result = await work(wrapClient(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {
          broken = true;
        });
        throw error;
      } finally {
        client.release(broken);
      }
    },
    close: () => pool.end(),
  };
}
