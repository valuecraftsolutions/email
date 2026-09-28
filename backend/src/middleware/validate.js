import { AppError } from '../utils/errors.js';

/**
 * Validates request parts with zod schemas. Parsed values are placed on
 * req.valid.{params,query,body}; req.body is also replaced with the parsed body.
 */
export const validate = (schemas) => (req, res, next) => {
  const details = [];
  const valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (result.success) valid[part] = result.data;
    else
      details.push(
        ...result.error.issues.map((issue) => ({
          field: issue.path.join('.') || part,
          message: issue.message,
        })),
      );
  }
  if (details.length)
    return next(
      new AppError(
        422,
        'VALIDATION_FAILED',
        'Please check the highlighted fields.',
        details,
      ),
    );
  req.valid = { ...req.valid, ...valid };
  if (valid.body) req.body = valid.body;
  next();
};
