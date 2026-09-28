import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { createLogger } from '../../src/config/logger.js';
import { rbacRepository } from '../../src/repositories/rbacRepository.js';
import { userRepository } from '../../src/repositories/userRepository.js';
import { createTestDatabase } from './testDb.js';

export const TEST_ORIGIN = 'http://localhost:4601';
export const DEFAULT_PASSWORD = 'Correct-Horse-Battery-42';

export function createTestConfig(overrides = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    APP_ORIGIN: TEST_ORIGIN,
    DATABASE_URL: 'postgres://unused-in-tests',
    SESSION_SECRET: 'test-session-secret-that-is-long-enough-123456',
    MAILBOX_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    LOG_LEVEL: 'silent',
    ARGON2_MEMORY_KIB: '1024',
    ARGON2_TIME_COST: '1',
    LOGIN_RATE_LIMIT_MAX: '1000',
    API_RATE_LIMIT_PER_MINUTE: '100000',
    ...overrides,
  });
}

export async function createTestApp(
  overrides = {},
  { mailProviderFactory } = {},
) {
  const config = createTestConfig(overrides);
  const db = await createTestDatabase();
  const logger = createLogger(config);
  const app = createApp({ config, db, logger, mailProviderFactory });
  const { passwordService } = app.locals.services;

  async function createUser({
    email,
    fullName = 'Test User',
    role = 'EMPLOYEE',
    status = 'ACTIVE',
    password = DEFAULT_PASSWORD,
  }) {
    const user = await userRepository.create(db, {
      email,
      fullName,
      status,
      passwordHash: password ? await passwordService.hash(password) : null,
    });
    if (role) await rbacRepository.assignRoleByCode(db, user.id, role);
    return user;
  }

  return { app, db, config, createUser, close: () => db.close() };
}

/** Signs in with a supertest agent and returns the CSRF token for later writes. */
export async function signIn(agent, email, password = DEFAULT_PASSWORD) {
  const res = await agent
    .post('/api/auth/login')
    .set('Origin', TEST_ORIGIN)
    .send({ email, password });
  if (res.status !== 200)
    throw new Error(
      `Sign-in failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  return res.body.data.csrfToken;
}
