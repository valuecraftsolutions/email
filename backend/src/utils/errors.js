/**
 * Expected, client-safe error. `code` is a stable machine-readable identifier;
 * `message` is shown to users and must never contain internal details.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const unauthenticated = () =>
  new AppError(
    401,
    'UNAUTHENTICATED',
    'Your session has expired. Please sign in again.',
  );

export const forbidden = () =>
  new AppError(
    403,
    'FORBIDDEN',
    'You do not have permission to perform this action.',
  );

export const notFound = (message = 'The requested resource was not found.') =>
  new AppError(404, 'NOT_FOUND', message);
