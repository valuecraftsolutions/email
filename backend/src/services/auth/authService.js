import { userRepository } from '../../repositories/userRepository.js';
import { toPublicUser } from '../../models/userModel.js';
import { AppError } from '../../utils/errors.js';
import { AUDIT_ACTIONS } from '../security/auditActions.js';

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');

export function createAuthService({
  db,
  config,
  passwordService,
  sessionService,
  rbacService,
  auditService,
}) {
  const { lockout } = config.security;

  const loginFailed = (context, { userId = null, email, reason, extra }) =>
    auditService.recordSafely({
      actorUserId: userId,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      outcome: 'FAILURE',
      resourceType: 'user',
      resourceId: userId,
      metadata: { email, reason, ...extra },
      context,
    });

  async function login({ email, password }, context) {
    const user = await userRepository.findAuthByEmail(db, email);

    if (!user || !user.password_hash) {
      await passwordService.verifyDummy(password);
      await loginFailed(context, {
        userId: user?.id,
        email,
        reason: user ? 'PASSWORD_NOT_SET' : 'UNKNOWN_USER',
      });
      throw invalidCredentials();
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await loginFailed(context, {
        userId: user.id,
        email,
        reason: 'ACCOUNT_LOCKED',
      });
      throw new AppError(
        423,
        'ACCOUNT_LOCKED',
        'Too many failed sign-in attempts. Please try again later.',
      );
    }

    if (!(await passwordService.verify(user.password_hash, password))) {
      const result = await userRepository.recordFailedLogin(
        db,
        user.id,
        lockout,
      );
      await loginFailed(context, {
        userId: user.id,
        email,
        reason: 'INVALID_PASSWORD',
        extra: { failedAttempts: result?.failed_login_count },
      });
      if (result?.locked_until && new Date(result.locked_until) > new Date())
        await auditService.recordSafely({
          actorUserId: user.id,
          action: AUDIT_ACTIONS.ACCOUNT_LOCKED,
          outcome: 'FAILURE',
          resourceType: 'user',
          resourceId: user.id,
          metadata: { lockedUntil: result.locked_until },
          context,
        });
      throw invalidCredentials();
    }

    // Status is only revealed after the correct password has been supplied.
    if (user.status !== 'ACTIVE') {
      await loginFailed(context, {
        userId: user.id,
        email,
        reason: `ACCOUNT_${user.status}`,
      });
      throw new AppError(
        403,
        'ACCOUNT_NOT_ACTIVE',
        'This account is not active. Please contact your administrator.',
      );
    }

    const { token, session } = await db.transaction(async (tx) => {
      await userRepository.recordSuccessfulLogin(tx, user.id);
      if (passwordService.needsRehash(user.password_hash))
        await userRepository.updatePasswordHash(
          tx,
          user.id,
          await passwordService.hash(password),
          { rotated: false },
        );
      const created = await sessionService.create(tx, {
        userId: user.id,
        context,
      });
      await auditService.record(
        {
          actorUserId: user.id,
          action: AUDIT_ACTIONS.LOGIN,
          resourceType: 'session',
          resourceId: created.session.id,
          context,
        },
        tx,
      );
      return created;
    });

    const [profile, access] = await Promise.all([
      userRepository.findById(db, user.id),
      rbacService.getUserAccess(user.id),
    ]);
    return {
      token,
      session,
      user: toPublicUser(profile),
      roles: access.roles,
      permissions: access.permissions,
      csrfToken: sessionService.csrfTokenFor(session.id),
    };
  }

  async function logout(auth, context) {
    await db.transaction(async (tx) => {
      await sessionService.revoke(tx, {
        userId: auth.userId,
        sessionId: auth.sessionId,
        reason: 'LOGOUT',
      });
      await auditService.record(
        {
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.LOGOUT,
          resourceType: 'session',
          resourceId: auth.sessionId,
          context,
        },
        tx,
      );
    });
  }

  async function revokeSession(auth, sessionId, context) {
    const revoked = await db.transaction(async (tx) => {
      const ok = await sessionService.revoke(tx, {
        userId: auth.userId,
        sessionId,
        reason: sessionId === auth.sessionId ? 'LOGOUT' : 'REVOKED_BY_USER',
      });
      if (ok)
        await auditService.record(
          {
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS.SESSION_REVOKED,
            resourceType: 'session',
            resourceId: sessionId,
            context,
          },
          tx,
        );
      return ok;
    });
    if (!revoked)
      throw new AppError(
        404,
        'SESSION_NOT_FOUND',
        'That session was not found or has already ended.',
      );
  }

  async function revokeOtherSessions(auth, context) {
    return db.transaction(async (tx) => {
      const count = await sessionService.revokeOthers(tx, {
        userId: auth.userId,
        currentSessionId: auth.sessionId,
        reason: 'REVOKED_OTHERS',
      });
      await auditService.record(
        {
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.OTHER_SESSIONS_REVOKED,
          resourceType: 'user',
          resourceId: auth.userId,
          metadata: { revokedSessions: count },
          context,
        },
        tx,
      );
      return count;
    });
  }

  async function changePassword(
    auth,
    { currentPassword, newPassword },
    context,
  ) {
    const hash = await userRepository.findPasswordHash(db, auth.userId);
    if (!hash || !(await passwordService.verify(hash, currentPassword))) {
      await auditService.recordSafely({
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PASSWORD_CHANGE_FAILED,
        outcome: 'FAILURE',
        resourceType: 'user',
        resourceId: auth.userId,
        metadata: { reason: 'INVALID_CURRENT_PASSWORD' },
        context,
      });
      // 400 rather than 401 so the client does not treat it as a lost session.
      throw new AppError(
        400,
        'INVALID_CURRENT_PASSWORD',
        'The current password is incorrect.',
        [
          {
            field: 'currentPassword',
            message: 'The current password is incorrect.',
          },
        ],
      );
    }
    if (newPassword === currentPassword)
      throw new AppError(
        422,
        'VALIDATION_FAILED',
        'Choose a different password.',
        [
          {
            field: 'newPassword',
            message: 'The new password must differ from the current one.',
          },
        ],
      );
    if (
      newPassword
        .toLowerCase()
        .includes(auth.user.email.split('@')[0].toLowerCase())
    )
      throw new AppError(
        422,
        'VALIDATION_FAILED',
        'Choose a stronger password.',
        [
          {
            field: 'newPassword',
            message: 'The password must not contain your email name.',
          },
        ],
      );

    const newHash = await passwordService.hash(newPassword);
    return db.transaction(async (tx) => {
      await userRepository.updatePasswordHash(tx, auth.userId, newHash);
      const revoked = await sessionService.revokeOthers(tx, {
        userId: auth.userId,
        currentSessionId: auth.sessionId,
        reason: 'PASSWORD_CHANGED',
      });
      await auditService.record(
        {
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.PASSWORD_CHANGED,
          resourceType: 'user',
          resourceId: auth.userId,
          metadata: { revokedSessions: revoked },
          context,
        },
        tx,
      );
      return { revokedSessions: revoked };
    });
  }

  return {
    login,
    logout,
    revokeSession,
    revokeOtherSessions,
    changePassword,
  };
}
