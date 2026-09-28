import test from 'node:test';
import assert from 'node:assert/strict';
import { runMigrations } from '../src/db/migrator.js';
import { createTestDatabase } from './helpers/testDb.js';

const REQUIRED_TABLES = [
  'users',
  'roles',
  'permissions',
  'role_permissions',
  'user_roles',
  'mailboxes',
  'user_mailboxes',
  'contacts',
  'contact_groups',
  'contact_group_members',
  'email_signatures',
  'user_preferences',
  'sessions',
  'audit_logs',
  'system_settings',
];

test('migrations create every required table and are idempotent', async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const { rows } = await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  const tables = new Set(rows.map((r) => r.table_name));
  for (const name of REQUIRED_TABLES)
    assert.ok(tables.has(name), `missing ${name}`);
  assert.deepEqual(await runMigrations(db), []);
});

test('edited migrations are detected', async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  await db.query(
    `UPDATE schema_migrations SET checksum = 'tampered' WHERE name = '001_foundation.sql'`,
  );
  await assert.rejects(runMigrations(db), /was modified after being applied/);
});

test('user codes are generated sequentially and emails must be lowercase', async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const insert = (email) =>
    db.query(
      `INSERT INTO users (email, full_name) VALUES ($1, 'Someone') RETURNING user_code, id`,
      [email],
    );
  const first = (await insert('a@valuecraftminds.com')).rows[0];
  const second = (await insert('b@valuecraftminds.com')).rows[0];
  assert.equal(first.user_code, 'USR0001');
  assert.equal(second.user_code, 'USR0002');
  assert.match(first.id, /^[0-9a-f-]{36}$/);
  await assert.rejects(insert('Mixed@ValueCraftMinds.com'));
  await assert.rejects(insert('a@valuecraftminds.com'));
});

test('audit_logs is append-only', async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  await db.query(`INSERT INTO audit_logs (action) VALUES ('auth.login')`);
  await assert.rejects(
    db.query(`UPDATE audit_logs SET action = 'auth.logout'`),
    /append-only/,
  );
  await assert.rejects(db.query('DELETE FROM audit_logs'), /append-only/);
  await assert.rejects(db.query('TRUNCATE audit_logs'), /append-only/);
});

test('contact group membership cannot cross owners', async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const user = async (email) =>
    (
      await db.query(
        `INSERT INTO users (email, full_name) VALUES ($1, 'U') RETURNING id`,
        [email],
      )
    ).rows[0].id;
  const alice = await user('alice@valuecraftminds.com');
  const bob = await user('bob@valuecraftminds.com');
  const contact = (
    await db.query(
      `INSERT INTO contacts (owner_user_id, email) VALUES ($1, 'x@example.com') RETURNING id`,
      [alice],
    )
  ).rows[0].id;
  const group = (
    await db.query(
      `INSERT INTO contact_groups (owner_user_id, name) VALUES ($1, 'Team') RETURNING id`,
      [bob],
    )
  ).rows[0].id;
  await assert.rejects(
    db.query(
      `INSERT INTO contact_group_members (group_id, contact_id, owner_user_id) VALUES ($1, $2, $3)`,
      [group, contact, bob],
    ),
  );
});

test('seeded role grants match the intended permission matrix', async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  const { rows } = await db.query(
    `SELECT r.code, array_agg(p.code ORDER BY p.code) AS permissions
     FROM roles r JOIN role_permissions rp ON rp.role_id = r.id
     JOIN permissions p ON p.id = rp.permission_id GROUP BY r.code`,
  );
  const grants = Object.fromEntries(
    rows.map((r) => [r.code, new Set(r.permissions)]),
  );
  const total = (await db.query('SELECT count(*)::int AS n FROM permissions'))
    .rows[0].n;

  assert.equal(grants.SUPER_ADMIN.size, total);
  assert.ok(!grants.ADMIN.has('roles.manage'));
  assert.ok(!grants.ADMIN.has('settings.update'));
  assert.ok(grants.ADMIN.has('users.create'));
  assert.ok(grants.ADMIN.has('audit.read'));
  assert.ok(grants.EMPLOYEE.has('mail.read_own'));
  assert.ok(grants.EMPLOYEE.has('signatures.manage_own'));
  for (const code of [
    'users.read',
    'roles.read',
    'audit.read',
    'settings.read',
    'signatures.manage_company',
  ])
    assert.ok(!grants.EMPLOYEE.has(code), `EMPLOYEE must not have ${code}`);
});
