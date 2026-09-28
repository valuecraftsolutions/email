import argon2 from 'argon2';

/**
 * Argon2id password hashing. Parameters come from configuration so production
 * can use strong settings while tests stay fast.
 */
export function createPasswordService({ memoryCost, timeCost }) {
  const options = {
    type: argon2.argon2id,
    memoryCost,
    timeCost,
    parallelism: 1,
  };
  let dummyHash;

  const verify = async (hash, password) => {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  };

  return {
    hash: (password) => argon2.hash(password, options),
    verify,
    needsRehash: (hash) => argon2.needsRehash(hash, options),
    /** Burns comparable CPU time when no real hash exists, reducing user enumeration by timing. */
    async verifyDummy(password) {
      dummyHash ??= argon2.hash(
        'timing-equaliser-not-a-real-password',
        options,
      );
      await verify(await dummyHash, password);
      return false;
    },
  };
}

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
