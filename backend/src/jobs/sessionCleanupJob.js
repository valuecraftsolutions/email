import { sessionRepository } from '../repositories/sessionRepository.js';

const INTERVAL_MS = 60 * 60 * 1000;
const RETENTION_DAYS = 30;

/** Hourly purge of sessions that ended more than 30 days ago. Returns a stop function. */
export function startSessionCleanupJob({ db, logger }) {
  const run = async () => {
    try {
      const removed = await sessionRepository.deleteEndedBefore(
        db,
        RETENTION_DAYS,
      );
      if (removed) logger.info({ removed }, 'Purged ended sessions');
    } catch (error) {
      logger.error({ err: error }, 'Session cleanup failed');
    }
  };
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
