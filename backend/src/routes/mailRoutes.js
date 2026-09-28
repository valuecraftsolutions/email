import { Router } from 'express';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  attachmentParams,
  deleteBody,
  draftBody,
  flagsBody,
  folderQuery,
  listMessagesQuery,
  messageParams,
  messageQuery,
  moveBody,
  pageQuery,
  searchQuery,
  sendBody,
} from '../validators/mailValidators.js';

export function createMailRoutes({
  mailController: c,
  authenticate,
  csrf,
  sendLimiter,
  composeUpload,
}) {
  const router = Router();
  router.use(authenticate, csrf, requirePermission('mail.read_own'));

  router.get('/capabilities', c.capabilities);
  router.get('/folders', c.listFolders);
  router.get(
    '/messages',
    validate({ query: listMessagesQuery }),
    c.listMessages,
  );
  router.get('/search', validate({ query: searchQuery }), c.search);
  router.get(
    '/messages/:uid',
    validate({ params: messageParams, query: messageQuery }),
    c.getMessage,
  );
  router.get(
    '/messages/:uid/attachments/:partId',
    validate({ params: attachmentParams, query: folderQuery }),
    c.downloadAttachment,
  );
  router.post('/messages/flags', validate({ body: flagsBody }), c.updateFlags);
  router.post('/messages/move', validate({ body: moveBody }), c.move);
  router.post(
    '/messages/delete',
    requirePermission('mail.delete_own'),
    validate({ body: deleteBody }),
    c.remove,
  );
  router.post(
    '/send',
    requirePermission('mail.send'),
    sendLimiter,
    composeUpload,
    validate({ body: sendBody }),
    c.send,
  );
  router.get('/drafts', validate({ query: pageQuery }), c.listDrafts);
  router.post(
    '/drafts',
    requirePermission('mail.send'),
    composeUpload,
    validate({ body: draftBody }),
    c.saveDraft,
  );
  return router;
}
