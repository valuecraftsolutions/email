import { preferenceRepository } from '../../repositories/preferenceRepository.js';
import { userRepository } from '../../repositories/userRepository.js';
import { toPublicUser } from '../../models/userModel.js';
import { AUDIT_ACTIONS } from '../security/auditActions.js';

const DEFAULTS = {
  theme: 'system',
  messagesPerPage: 50,
  density: 'comfortable',
  signatureMode: 'company',
};

const toDto = (row) =>
  row
    ? {
        theme: row.theme,
        messagesPerPage: row.messages_per_page,
        density: row.density,
        signatureMode: row.signature_mode,
      }
    : { ...DEFAULTS };

/** Per-user UI preferences and the self-editable part of the profile. */
export function createPreferenceService({ db, auditService }) {
  return {
    async get(userId) {
      return toDto(await preferenceRepository.find(db, userId));
    },

    async update(userId, fields) {
      return toDto(await preferenceRepository.upsert(db, userId, fields));
    },

    async updateProfile(auth, fields, context) {
      const row = await db.transaction(async (tx) => {
        const updated = await userRepository.updateProfile(
          tx,
          auth.userId,
          fields,
        );
        await auditService.record(
          {
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS.USER_UPDATED,
            resourceType: 'user',
            resourceId: auth.userId,
            metadata: { fields: Object.keys(fields), source: 'self_service' },
            context,
          },
          tx,
        );
        return updated;
      });
      return toPublicUser(row);
    },
  };
}
