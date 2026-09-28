import { sendSuccess } from '../utils/response.js';

// Types a browser could render as an active document are always downloaded as opaque bytes.
const ACTIVE_TYPES = /html|xml|svg|javascript|ecmascript|x-sh|x-msdownload/i;
const MIME = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i;

export const safeContentType = (type) =>
  type && MIME.test(type) && !ACTIVE_TYPES.test(type)
    ? type.toLowerCase()
    : 'application/octet-stream';

/** RFC 6266 attachment header with an ASCII fallback and a UTF-8 filename*. */
export function attachmentDisposition(filename) {
  const clean =
    String(filename || 'attachment')
      .replace(/[\u0000-\u001f\u007f/\\]/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 200) || 'attachment';
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_').replace(/["%;]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

export function createMailController({ mailService }) {
  return {
    async capabilities(req, res) {
      sendSuccess(res, {
        capabilities: await mailService.capabilities(req.auth.userId),
      });
    },

    async listFolders(req, res) {
      sendSuccess(res, {
        folders: await mailService.listFolders(req.auth.userId),
      });
    },

    async listMessages(req, res) {
      sendSuccess(
        res,
        await mailService.listMessages(req.auth.userId, req.valid.query),
      );
    },

    async search(req, res) {
      const { q, ...criteria } = req.valid.query;
      sendSuccess(
        res,
        await mailService.searchMessages(req.auth.userId, {
          ...criteria,
          text: q,
        }),
      );
    },

    async getMessage(req, res) {
      const { folder, markRead, images } = req.valid.query;
      sendSuccess(res, {
        message: await mailService.getMessage(req.auth.userId, {
          folder,
          uid: req.valid.params.uid,
          markRead,
          allowRemoteImages: images,
        }),
      });
    },

    async downloadAttachment(req, res) {
      const attachment = await mailService.getAttachment(req.auth.userId, {
        folder: req.valid.query.folder,
        uid: req.valid.params.uid,
        partId: req.valid.params.partId,
      });
      res.set({
        'Content-Type': safeContentType(attachment.contentType),
        'Content-Disposition': attachmentDisposition(attachment.filename),
        'Content-Length': String(attachment.size),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, no-store',
      });
      res.end(attachment.content);
    },

    async updateFlags(req, res) {
      sendSuccess(
        res,
        await mailService.updateFlags(req.auth.userId, req.body),
      );
    },

    async move(req, res) {
      sendSuccess(
        res,
        await mailService.moveMessages(req.auth.userId, req.body),
      );
    },

    async remove(req, res) {
      sendSuccess(
        res,
        await mailService.deleteMessages(req.auth.userId, req.body),
      );
    },

    async send(req, res) {
      sendSuccess(
        res,
        await mailService.sendMessage(
          req.auth,
          req.body,
          req.context,
          req.uploads,
        ),
        201,
      );
    },

    async listDrafts(req, res) {
      sendSuccess(
        res,
        await mailService.listDrafts(req.auth.userId, req.valid.query),
      );
    },

    async saveDraft(req, res) {
      sendSuccess(
        res,
        await mailService.saveDraft(req.auth, req.body, req.uploads),
        201,
      );
    },
  };
}
