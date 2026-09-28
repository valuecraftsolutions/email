import { AppError } from '../utils/errors.js';
import { sendSuccess } from '../utils/response.js';

export function createHealthController({ db, logger }) {
  return {
    live(req, res) {
      sendSuccess(res, { status: 'ok' });
    },
    async ready(req, res) {
      try {
        await db.query('SELECT 1');
      } catch (error) {
        logger.error({ code: error.code }, 'Readiness check failed: database');
        throw new AppError(503, 'NOT_READY', 'Service is not ready.');
      }
      sendSuccess(res, { status: 'ready', database: 'ok' });
    },
  };
}
