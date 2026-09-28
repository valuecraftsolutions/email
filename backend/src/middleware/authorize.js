import { forbidden, unauthenticated } from '../utils/errors.js';

/** Requires every listed permission. Permissions come from the database via req.auth. */
export const requirePermission =
  (...codes) =>
  (req, res, next) => {
    if (!req.auth) return next(unauthenticated());
    if (!codes.every((code) => req.auth.permissions.has(code)))
      return next(forbidden());
    next();
  };

/** Requires at least one of the listed permissions. */
export const requireAnyPermission =
  (...codes) =>
  (req, res, next) => {
    if (!req.auth) return next(unauthenticated());
    if (!codes.some((code) => req.auth.permissions.has(code)))
      return next(forbidden());
    next();
  };
