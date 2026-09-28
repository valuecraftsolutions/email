import { Router } from 'express';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  companySignatureBody,
  contactCreateBody,
  contactIdParams,
  contactListQuery,
  contactUpdateBody,
  mySignatureBody,
  preferencesBody,
  previewSignatureBody,
  profileBody,
  suggestQuery,
} from '../validators/productivityValidators.js';

export function createContactRoutes({
  contactController: c,
  authenticate,
  csrf,
}) {
  const router = Router();
  router.use(authenticate, csrf);
  router.get(
    '/',
    requirePermission('contacts.read'),
    validate({ query: contactListQuery }),
    c.list,
  );
  router.get(
    '/suggest',
    requirePermission('contacts.read'),
    validate({ query: suggestQuery }),
    c.suggest,
  );
  router.get(
    '/:id',
    requirePermission('contacts.read'),
    validate({ params: contactIdParams }),
    c.get,
  );
  router.post(
    '/',
    requirePermission('contacts.create'),
    validate({ body: contactCreateBody }),
    c.create,
  );
  router.patch(
    '/:id',
    requirePermission('contacts.update'),
    validate({ params: contactIdParams, body: contactUpdateBody }),
    c.update,
  );
  router.delete(
    '/:id',
    requirePermission('contacts.delete'),
    validate({ params: contactIdParams }),
    c.remove,
  );
  return router;
}

export function createSignatureRoutes({
  signatureController: c,
  authenticate,
  csrf,
}) {
  const router = Router();
  router.use(authenticate, csrf, requirePermission('signatures.read'));
  router.get('/me', c.mine);
  router.put(
    '/me',
    requirePermission('signatures.manage_own'),
    validate({ body: mySignatureBody }),
    c.updateMine,
  );
  router.post('/preview', validate({ body: previewSignatureBody }), c.preview);
  router.get('/company', c.company);
  router.put(
    '/company',
    requirePermission('signatures.manage_company'),
    validate({ body: companySignatureBody }),
    c.updateCompany,
  );
  return router;
}

/** Own preferences and profile: any signed-in user, no extra permission. */
export function createPreferenceRoutes({
  preferenceController: c,
  authenticate,
  csrf,
}) {
  const router = Router();
  router.use(authenticate, csrf);
  router.get('/', c.get);
  router.put('/', validate({ body: preferencesBody }), c.update);
  return router;
}

export function createProfileRoutes({
  preferenceController: c,
  authenticate,
  csrf,
}) {
  const router = Router();
  router.use(authenticate, csrf);
  router.get('/', c.profile);
  router.patch('/', validate({ body: profileBody }), c.updateProfile);
  return router;
}
