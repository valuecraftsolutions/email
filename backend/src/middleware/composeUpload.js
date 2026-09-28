import multer from 'multer';
import { AppError } from '../utils/errors.js';

/**
 * Accepts compose requests either as JSON or as multipart/form-data with a
 * `message` field (JSON) and `attachments` files. Files stay in memory (no
 * temporary files, so nothing to clean up and no client-controlled paths).
 * Per-file size is capped here; totals and types are enforced by the
 * attachment policy.
 */
export function createComposeUpload(config) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      files: config.mail.maxAttachments,
      fileSize: config.mail.maxAttachmentBytes,
      fields: 5,
      fieldSize: 6 * 1024 * 1024,
      parts: config.mail.maxAttachments + 5,
    },
  }).array('attachments', config.mail.maxAttachments);

  return function composeUpload(req, res, next) {
    if (!req.is('multipart/form-data')) {
      req.uploads = [];
      return next();
    }
    upload(req, res, (error) => {
      if (error) return next(error);
      try {
        req.body = JSON.parse(req.body?.message ?? '{}');
      } catch {
        return next(
          new AppError(
            400,
            'INVALID_JSON',
            'The message field is not valid JSON.',
          ),
        );
      }
      req.uploads = req.files ?? [];
      next();
    });
  };
}
