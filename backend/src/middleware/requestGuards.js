import { AppError } from '../utils/errors.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOWED_BODY_TYPES = ['application/json', 'multipart/form-data'];

/**
 * Defence in depth for unsafe requests (including unauthenticated ones such as login):
 *  - reject requests whose Origin is not an allowed application origin
 *  - reject browser requests the browser itself labels as cross-site
 *  - reject bodies that are not JSON or multipart (blocks classic form-post CSRF)
 */
export function createRequestGuards(config) {
  const allowed = new Set(config.corsOrigins);
  return (req, res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) return next();

    const origin = req.get('origin');
    if (
      origin ? !allowed.has(origin) : req.get('sec-fetch-site') === 'cross-site'
    )
      return next(
        new AppError(
          403,
          'ORIGIN_NOT_ALLOWED',
          'Request origin is not allowed.',
        ),
      );

    const hasBody =
      Number(req.get('content-length') || 0) > 0 ||
      req.get('transfer-encoding');
    if (hasBody && !ALLOWED_BODY_TYPES.some((type) => req.is(type)))
      return next(
        new AppError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'Unsupported request content type.',
        ),
      );
    next();
  };
}
