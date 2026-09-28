import { AppError } from '../../utils/errors.js';
import { MAIL_ERROR, MailProviderError } from './MailProvider.js';

/** Translates provider errors into client-safe API errors. */
export function toAppError(error, { connecting = false } = {}) {
  if (!(error instanceof MailProviderError)) return error;
  switch (error.code) {
    case MAIL_ERROR.AUTH_FAILED:
      return connecting
        ? new AppError(
            400,
            'MAILBOX_AUTH_FAILED',
            'The mail server rejected this password. Check it and try again.',
            [{ field: 'password', message: 'Incorrect mailbox password.' }],
          )
        : new AppError(
            409,
            'MAILBOX_CREDENTIALS_INVALID',
            'Your mailbox password is no longer accepted. Reconnect your mailbox in Settings.',
          );
    case MAIL_ERROR.UNAVAILABLE:
      return new AppError(
        503,
        'MAIL_PROVIDER_UNAVAILABLE',
        'The mail server is not reachable right now. Please try again shortly.',
      );
    case MAIL_ERROR.RATE_LIMITED:
      return new AppError(
        429,
        'MAIL_PROVIDER_RATE_LIMITED',
        'The mail server is busy. Please wait a moment and try again.',
      );
    case MAIL_ERROR.NOT_FOUND:
      return new AppError(404, 'MAIL_NOT_FOUND', error.message);
    case MAIL_ERROR.NOT_SUPPORTED:
      return new AppError(
        501,
        'NOT_SUPPORTED',
        'This action is not supported by the mail provider.',
        error.capability
          ? [{ field: 'capability', message: error.capability }]
          : undefined,
      );
    case MAIL_ERROR.RECIPIENT_REJECTED:
      return new AppError(
        422,
        'MAIL_RECIPIENT_REJECTED',
        'The mail server rejected one or more recipients.',
      );
    case MAIL_ERROR.TOO_LARGE:
      return new AppError(
        413,
        'MAIL_TOO_LARGE',
        'The message is larger than the mail server allows.',
      );
    default:
      return new AppError(
        502,
        'MAIL_PROVIDER_ERROR',
        'The mail server returned an unexpected error. Please try again.',
      );
  }
}
