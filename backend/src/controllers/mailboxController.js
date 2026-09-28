import { sendSuccess } from '../utils/response.js';

export function createMailboxController({ mailboxService, mailService }) {
  return {
    async listMine(req, res) {
      sendSuccess(res, {
        mailboxes: await mailboxService.listMine(req.auth.userId),
      });
    },

    async connect(req, res) {
      const mailbox = await mailboxService.connectOwn(
        req.auth,
        req.body,
        req.context,
      );
      sendSuccess(res, { mailbox });
    },

    async test(req, res) {
      sendSuccess(res, await mailService.testConnection(req.auth.userId));
    },

    async disconnect(req, res) {
      await mailboxService.disconnectOwn(req.auth, req.context);
      sendSuccess(res, { disconnected: true });
    },
  };
}
