import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

/**
 * AES-256-GCM encryption for secrets that must be stored (e.g. mailbox
 * credentials). The key comes from the environment, never the database.
 * Output format: v1:<keyId>:<iv>:<authTag>:<ciphertext> (base64url parts).
 * `associatedData` binds a ciphertext to its owner (e.g. a mailbox id) so it
 * cannot be copied onto another row.
 */
export function createEncryptionService({ key, keyId }) {
  const requireKey = () => {
    if (!key)
      throw new Error(
        'MAILBOX_ENCRYPTION_KEY is not configured; secrets cannot be stored.',
      );
    return key;
  };

  return {
    isConfigured: () => Boolean(key),

    encrypt(plaintext, associatedData = '') {
      const iv = randomBytes(12);
      const cipher = createCipheriv(ALGORITHM, requireKey(), iv);
      cipher.setAAD(Buffer.from(associatedData));
      const ciphertext = Buffer.concat([
        cipher.update(String(plaintext), 'utf8'),
        cipher.final(),
      ]);
      return [
        VERSION,
        keyId,
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        ciphertext.toString('base64url'),
      ].join(':');
    },

    decrypt(payload, associatedData = '') {
      const parts = String(payload).split(':');
      if (parts.length !== 5 || parts[0] !== VERSION)
        throw new Error('Unsupported encrypted payload format');
      const [, payloadKeyId, iv, tag, ciphertext] = parts;
      if (payloadKeyId !== keyId)
        throw new Error(`Encrypted with unknown key id "${payloadKeyId}"`);
      const decipher = createDecipheriv(
        ALGORITHM,
        requireKey(),
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAAD(Buffer.from(associatedData));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
