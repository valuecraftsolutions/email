import { AppError, notFound } from '../utils/errors.js';
import { sendError } from '../utils/response.js';

const DB_UNAVAILABLE = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  '57P01',
  '57P02',
  '57P03',
  '53300',
]);

function normalize(error) {
  if (error instanceof AppError) return error;
  if (error?.type === 'entity.parse.failed')
    return new AppError(
      400,
      'INVALID_JSON',
      'The request body is not valid JSON.',
    );
  if (error?.type === 'entity.too.large')
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
  if (error?.name === 'MulterError')
    return error.code === 'LIMIT_FILE_SIZE'
      ? new AppError(
          413,
          'ATTACHMENTS_TOO_LARGE',
          'An attachment is larger than the allowed size.',
        )
      : new AppError(
          422,
          'INVALID_UPLOAD',
          error.code === 'LIMIT_FILE_COUNT' ||
            error.code === 'LIMIT_UNEXPECTED_FILE'
            ? 'Too many attachments.'
            : 'The upload could not be processed.',
        );
  if (error?.code === '23505')
    return new AppError(
      409,
      'CONFLICT',
      'A record with these details already exists.',
    );
  if (error?.code === '23503')
    return new AppError(
      409,
      'RELATED_RECORD_MISSING',
      'A related record is no longer available.',
    );
  if (DB_UNAVAILABLE.has(error?.code))
    return new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      'The service is temporarily unavailable. Please try again shortly.',
    );
  return null;
}

export const notFoundHandler = (req, res, next) =>
  next(notFound('The requested endpoint does not exist.'));

/** Converts every error into the standard envelope. Stack traces never leave the server. */
export function createErrorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);
    const known = normalize(error);
    const requestId = req.context?.requestId;
    if (!known || known.status >= 500)
      logger.error({ err: error, requestId }, 'Unhandled request error');
    const status = known?.status ?? 500;
    sendError(res, status, {
      code: known?.code ?? 'INTERNAL_ERROR',
      message:
        known?.message ?? 'An unexpected error occurred. Please try again.',
      ...(known?.details ? { details: known.details } : {}),
      requestId,
    });
  };
}
