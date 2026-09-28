import { mailboxRepository } from '../../repositories/mailboxRepository.js';
import { AppError } from '../../utils/errors.js';
import { AUDIT_ACTIONS } from '../security/auditActions.js';
import { toAppError } from './mailErrors.js';
import { credentialsAad } from './mailService.js';

const toMailboxDto = (row) => ({
  id: row.id,
  emailAddress: row.email_address,
  displayName: row.display_name,
  provider: row.provider,
  status: row.status,
  connectionStatus: row.connection_status,
  hasCredentials: row.has_credentials,
  credentialsUpdatedAt: row.credentials_updated_at,
  lastConnectedAt: row.last_connected_at,
  lastErrorCode: row.last_error_code,
  lastErrorAt: row.last_error_at,
  accessLevel: row.access_level ?? null,
  isPrimary: row.is_primary ?? null,
});

/**
 * Self-service mailbox connection: a user links the Hostinger mailbox that
 * matches their own sign-in address by entering its password once. The
 * password is verified against the provider before it is stored, encrypted.
 */
export function createMailboxService({
  db,
  config,
  encryptionService,
  auditService,
  providerFactory,
}) {
  const providerId = config.mail.provider;

  function assertAllowedAddress(email) {
    const domain = email.split('@')[1];
    if (!config.mail.allowedDomains.includes(domain))
      throw new AppError(
        422,
        'MAILBOX_DOMAIN_NOT_ALLOWED',
        'Only company mailboxes can be connected.',
      );
  }

  return {
    async listMine(userId) {
      return (await mailboxRepository.listForUser(db, userId)).map(
        toMailboxDto,
      );
    },

    async connectOwn(auth, { password }, context) {
      if (!encryptionService.isConfigured())
        throw new AppError(
          503,
          'ENCRYPTION_NOT_CONFIGURED',
          'Mailbox connections are not available until the server encryption key is configured.',
        );
      const emailAddress = auth.user.email;
      assertAllowedAddress(emailAddress);

      const existing = await mailboxRepository.findByEmail(db, emailAddress);
      if (existing?.owner_user_id && existing.owner_user_id !== auth.userId)
        throw new AppError(
          409,
          'MAILBOX_ASSIGNED_TO_OTHER_USER',
          'This mailbox is assigned to another user. Contact your administrator.',
        );
      if (existing && existing.status !== 'ACTIVE')
        throw new AppError(
          409,
          'MAILBOX_DISABLED',
          'This mailbox has been disabled by an administrator.',
        );

      // Verify with the provider before anything is stored.
      const probe = providerFactory.create(providerId, {
        mailbox: { id: existing?.id ?? 'probe', emailAddress },
        credentials: { username: emailAddress, password },
        pooled: false,
      });
      try {
        await probe.verifyConnection();
      } catch (error) {
        await auditService.recordSafely({
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.MAILBOX_CONNECT_FAILED,
          outcome: 'FAILURE',
          resourceType: 'mailbox',
          resourceId: existing?.id ?? null,
          metadata: { emailAddress, reason: error.code ?? 'UNKNOWN' },
          context,
        });
        throw toAppError(error, { connecting: true });
      }

      const mailbox = await db.transaction(async (tx) => {
        const row =
          existing ??
          (await mailboxRepository.create(tx, {
            emailAddress,
            displayName: auth.user.fullName,
            provider: providerId,
            createdBy: auth.userId,
          }));
        await mailboxRepository.setCredentials(tx, row.id, {
          credentialsEncrypted: encryptionService.encrypt(
            JSON.stringify({ username: emailAddress, password }),
            credentialsAad(row.id),
          ),
          updatedBy: auth.userId,
        });
        await mailboxRepository.assignOwner(tx, {
          userId: auth.userId,
          mailboxId: row.id,
          assignedBy: auth.userId,
        });
        await auditService.record(
          {
            actorUserId: auth.userId,
            action: existing
              ? AUDIT_ACTIONS.MAILBOX_CREDENTIALS_UPDATED
              : AUDIT_ACTIONS.MAILBOX_MAPPING_CHANGED,
            resourceType: 'mailbox',
            resourceId: row.id,
            metadata: {
              emailAddress,
              provider: providerId,
              source: 'self_service',
            },
            context,
          },
          tx,
        );
        return row;
      });
      providerFactory.evict(mailbox.id);
      const [mine] = (
        await mailboxRepository.listForUser(db, auth.userId)
      ).filter((m) => m.id === mailbox.id);
      return toMailboxDto(mine);
    },

    async disconnectOwn(auth, context) {
      const mailbox = await mailboxRepository.findPrimaryWithCredentials(
        db,
        auth.userId,
      );
      if (!mailbox?.credentials_encrypted)
        throw new AppError(
          404,
          'MAILBOX_NOT_CONNECTED',
          'No mailbox is connected.',
        );
      await db.transaction(async (tx) => {
        await mailboxRepository.clearCredentials(tx, mailbox.id, auth.userId);
        await auditService.record(
          {
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS.MAILBOX_DISCONNECTED,
            resourceType: 'mailbox',
            resourceId: mailbox.id,
            metadata: { emailAddress: mailbox.email_address },
            context,
          },
          tx,
        );
      });
      providerFactory.evict(mailbox.id);
    },
  };
}
