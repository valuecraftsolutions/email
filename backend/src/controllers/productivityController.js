import { sendSuccess } from '../utils/response.js';

export function createSignatureController({ signatureService }) {
  return {
    async mine(req, res) {
      sendSuccess(res, await signatureService.mine(req.auth.userId));
    },
    async updateMine(req, res) {
      sendSuccess(
        res,
        await signatureService.updateMine(req.auth.userId, req.body),
      );
    },
    async company(req, res) {
      sendSuccess(res, await signatureService.company());
    },
    async updateCompany(req, res) {
      sendSuccess(
        res,
        await signatureService.updateCompany(
          req.auth,
          req.body.html,
          req.context,
        ),
      );
    },
    async preview(req, res) {
      sendSuccess(
        res,
        await signatureService.preview(req.auth.userId, req.body.html),
      );
    },
  };
}

export function createPreferenceController({ preferenceService }) {
  return {
    async get(req, res) {
      sendSuccess(res, {
        preferences: await preferenceService.get(req.auth.userId),
      });
    },
    async update(req, res) {
      sendSuccess(res, {
        preferences: await preferenceService.update(req.auth.userId, req.body),
      });
    },
    profile(req, res) {
      sendSuccess(res, { user: req.auth.user });
    },
    async updateProfile(req, res) {
      sendSuccess(res, {
        user: await preferenceService.updateProfile(
          req.auth,
          req.body,
          req.context,
        ),
      });
    },
  };
}
