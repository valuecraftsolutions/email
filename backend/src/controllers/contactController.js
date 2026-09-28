import { sendSuccess } from '../utils/response.js';

export function createContactController({ contactService }) {
  return {
    async list(req, res) {
      sendSuccess(
        res,
        await contactService.list(req.auth.userId, req.valid.query),
      );
    },
    async suggest(req, res) {
      sendSuccess(res, {
        suggestions: await contactService.suggest(
          req.auth.userId,
          req.valid.query.q,
        ),
      });
    },
    async get(req, res) {
      sendSuccess(res, {
        contact: await contactService.get(req.auth.userId, req.valid.params.id),
      });
    },
    async create(req, res) {
      sendSuccess(
        res,
        { contact: await contactService.create(req.auth.userId, req.body) },
        201,
      );
    },
    async update(req, res) {
      sendSuccess(res, {
        contact: await contactService.update(
          req.auth.userId,
          req.valid.params.id,
          req.body,
        ),
      });
    },
    async remove(req, res) {
      await contactService.remove(req.auth.userId, req.valid.params.id);
      sendSuccess(res, { deleted: true });
    },
  };
}
