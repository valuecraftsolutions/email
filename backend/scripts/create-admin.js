/**
 * Bootstraps an application user (typically the first SUPER_ADMIN).
 *
 *   npm run admin:create -- --email roshan@valuecraftminds.com --name "Roshan Srimal" [--role SUPER_ADMIN]
 *
 * The password is read from a hidden prompt, or from ADMIN_INITIAL_PASSWORD for
 * non-interactive provisioning. It is never accepted as a command-line argument
 * (arguments end up in shell history and process listings).
 */
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import '../src/config/loadEnv.js';
import { loadConfigOrExit } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { createPostgresDatabase } from '../src/db/database.js';
import { rbacRepository } from '../src/repositories/rbacRepository.js';
import { userRepository } from '../src/repositories/userRepository.js';
import { createPasswordService } from '../src/services/auth/passwordService.js';
import { AUDIT_ACTIONS } from '../src/services/security/auditActions.js';
import { createAuditService } from '../src/services/security/auditService.js';
import {
  emailSchema,
  newPasswordSchema,
} from '../src/validators/authValidators.js';

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    let muted = false;
    rl._writeToOutput = (text) => {
      if (!muted) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'SUPER_ADMIN' },
    'job-title': { type: 'string' },
    department: { type: 'string' },
  },
});

const email = emailSchema.safeParse(values.email ?? '');
if (!email.success || !values.name?.trim()) {
  console.error(
    'Usage: npm run admin:create -- --email <email> --name "<full name>" [--role SUPER_ADMIN|ADMIN|EMPLOYEE]',
  );
  process.exit(1);
}

let password = process.env.ADMIN_INITIAL_PASSWORD;
if (!password) {
  password = await promptHidden('Password: ');
  const confirm = await promptHidden('Confirm password: ');
  if (password !== confirm) {
    console.error('Passwords do not match.');
    process.exit(1);
  }
}
const passwordCheck = newPasswordSchema.safeParse(password);
if (!passwordCheck.success) {
  console.error(`Password rejected: ${passwordCheck.error.issues[0].message}`);
  process.exit(1);
}

const config = loadConfigOrExit();
const logger = createLogger(config);
const db = createPostgresDatabase(config.database, logger);
const passwordService = createPasswordService(config.passwordHashing);
const auditService = createAuditService({ db, logger });

try {
  const passwordHash = await passwordService.hash(password);
  const user = await db.transaction(async (tx) => {
    const created = await userRepository.create(tx, {
      email: email.data,
      fullName: values.name.trim(),
      jobTitle: values['job-title'],
      department: values.department,
      status: 'ACTIVE',
      passwordHash,
    });
    if (!(await rbacRepository.assignRoleByCode(tx, created.id, values.role)))
      throw new Error(`Role ${values.role} does not exist.`);
    await auditService.record(
      {
        action: AUDIT_ACTIONS.USER_CREATED,
        resourceType: 'user',
        resourceId: created.id,
        metadata: { source: 'cli', email: created.email, role: values.role },
      },
      tx,
    );
    return created;
  });
  console.log(
    `Created ${user.user_code} <${user.email}> with role ${values.role}.`,
  );
} catch (error) {
  console.error(
    error.code === '23505'
      ? 'A user with that email already exists.'
      : `Could not create user: ${error.message}`,
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
