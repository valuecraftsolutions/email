/** Structured access log. Query strings are omitted because they may carry search terms. */
export function createRequestLogger(logger) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const path = req.originalUrl.split('?')[0];
      const status = res.statusCode;
      const level =
        status >= 500
          ? 'error'
          : status >= 400
            ? 'warn'
            : path.startsWith('/api/health')
              ? 'debug'
              : 'info';
      logger[level](
        {
          requestId: req.context?.requestId,
          method: req.method,
          path,
          status,
          durationMs: Math.round(
            Number(process.hrtime.bigint() - started) / 1e6,
          ),
          userId: req.auth?.userId,
        },
        'request completed',
      );
    });
    next();
  };
}
