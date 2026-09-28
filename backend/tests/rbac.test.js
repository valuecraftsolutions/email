import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  requireAnyPermission,
  requirePermission,
} from '../src/middleware/authorize.js';
import { createTestApp, signIn } from './helpers/testApp.js';

const run = (middleware, auth) =>
  new Promise((resolve) => middleware({ auth }, {}, (error) => resolve(error)));

test('requirePermission demands every listed permission', async () => {
  const auth = { permissions: new Set(['users.read']) };
  assert.equal(await run(requirePermission('users.read'), auth), undefined);
  assert.equal(
    (await run(requirePermission('users.read', 'users.create'), auth)).status,
    403,
  );
  assert.equal(
    (await run(requirePermission('users.read'), undefined)).status,
    401,
  );
});

test('requireAnyPermission accepts any listed permission', async () => {
  const auth = { permissions: new Set(['audit.read']) };
  assert.equal(
    await run(requireAnyPermission('users.read', 'audit.read'), auth),
    undefined,
  );
  assert.equal(
    (await run(requireAnyPermission('users.read'), auth)).status,
    403,
  );
});

test('role and permission endpoints are enforced from database grants', async (t) => {
  const { app, db, createUser, close } = await createTestApp();
  t.after(close);
  await createUser({ email: 'employee@valuecraftminds.com', role: 'EMPLOYEE' });
  await createUser({ email: 'admin@valuecraftminds.com', role: 'ADMIN' });
  await createUser({ email: 'norole@valuecraftminds.com', role: null });

  const employee = request.agent(app);
  await signIn(employee, 'employee@valuecraftminds.com');
  const denied = await employee.get('/api/roles');
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'FORBIDDEN');
  assert.equal((await employee.get('/api/permissions')).status, 403);

  const noRole = request.agent(app);
  await signIn(noRole, 'norole@valuecraftminds.com');
  const me = await noRole.get('/api/auth/me');
  assert.deepEqual(me.body.data.permissions, []);
  assert.equal((await noRole.get('/api/roles')).status, 403);

  const admin = request.agent(app);
  await signIn(admin, 'admin@valuecraftminds.com');
  const roles = await admin.get('/api/roles');
  assert.equal(roles.status, 200);
  const byCode = Object.fromEntries(
    roles.body.data.roles.map((r) => [r.code, r]),
  );
  assert.deepEqual(Object.keys(byCode).sort(), [
    'ADMIN',
    'EMPLOYEE',
    'SUPER_ADMIN',
  ]);
  assert.equal(byCode.ADMIN.userCount, 1);
  assert.ok(!byCode.ADMIN.permissions.includes('roles.manage'));

  const permissions = await admin.get('/api/permissions');
  assert.equal(permissions.status, 200);
  assert.ok(
    permissions.body.data.permissions.some((p) => p.code === 'mail.send'),
  );

  // Revoking a grant in the database takes effect on the next request, no re-login needed.
  await db.query(
    `DELETE FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE code = 'ADMIN')
       AND permission_id = (SELECT id FROM permissions WHERE code = 'roles.read')`,
  );
  assert.equal((await admin.get('/api/roles')).status, 403);
});
