import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { renderSignature } from '../src/services/signatures/signatureService.js';
import { createTestApp, signIn, TEST_ORIGIN } from './helpers/testApp.js';

async function setup(
  t,
  users = [{ email: 'employee@valuecraftminds.com', role: 'EMPLOYEE' }],
) {
  const ctx = await createTestApp();
  t.after(() => ctx.close());
  const agents = {};
  for (const u of users) {
    await ctx.createUser({ fullName: 'Nimal Perera', ...u });
    const agent = request.agent(ctx.app);
    const csrf = await signIn(agent, u.email);
    const send = (method, path, body) =>
      agent[method](path)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrf)
        .send(body);
    agents[u.email] = { agent, csrf, send };
  }
  return { ...ctx, agents };
}

// ----------------------------------------------------------------- contacts

test('contacts CRUD, search, favorites and duplicate handling', async (t) => {
  const { agents } = await setup(t);
  const { agent, send } = agents['employee@valuecraftminds.com'];

  const created = await send('post', '/api/contacts', {
    firstName: 'Kasun',
    lastName: 'Silva',
    email: '  Kasun@Client.LK ',
    company: 'Client Ltd',
    phone: '+94 77 123 4567',
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const { contact } = created.body.data;
  assert.equal(contact.email, 'kasun@client.lk');
  assert.equal(contact.name, 'Kasun Silva');

  const dup = await send('post', '/api/contacts', { email: 'kasun@client.lk' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'CONTACT_EXISTS');

  const empty = await send('post', '/api/contacts', { phone: '123' });
  assert.equal(empty.status, 422);

  await send('post', '/api/contacts', {
    displayName: 'Amaya (Finance)',
    email: 'amaya@partner.com',
  });
  const search = await agent.get('/api/contacts?q=client');
  assert.deepEqual(
    search.body.data.contacts.map((c) => c.email),
    ['kasun@client.lk'],
  );
  const wildcard = await agent.get('/api/contacts?q=%25');
  assert.equal(
    wildcard.body.data.contacts.length,
    0,
    'LIKE wildcards are escaped',
  );

  const fav = await send('patch', `/api/contacts/${contact.id}`, {
    isFavorite: true,
    notes: 'Key account',
  });
  assert.equal(fav.status, 200);
  assert.equal(fav.body.data.contact.isFavorite, true);
  assert.equal(
    fav.body.data.contact.company,
    'Client Ltd',
    'partial update keeps other fields',
  );
  const favorites = await agent.get('/api/contacts?favorite=true');
  assert.equal(favorites.body.data.total, 1);

  const removed = await send('delete', `/api/contacts/${contact.id}`);
  assert.equal(removed.status, 200);
  assert.equal((await agent.get(`/api/contacts/${contact.id}`)).status, 404);
});

test('contacts are private to their owner', async (t) => {
  const { agents } = await setup(t, [
    { email: 'a@valuecraftminds.com', role: 'EMPLOYEE' },
    { email: 'b@valuecraftminds.com', role: 'EMPLOYEE' },
  ]);
  const a = agents['a@valuecraftminds.com'];
  const b = agents['b@valuecraftminds.com'];
  const { body } = await a.send('post', '/api/contacts', {
    email: 'secret@client.com',
  });
  const id = body.data.contact.id;

  assert.equal((await b.agent.get(`/api/contacts/${id}`)).status, 404);
  assert.equal(
    (await b.send('patch', `/api/contacts/${id}`, { notes: 'x' })).status,
    404,
  );
  assert.equal((await b.send('delete', `/api/contacts/${id}`)).status, 404);
  assert.equal((await b.agent.get('/api/contacts')).body.data.total, 0);
  assert.equal((await a.agent.get(`/api/contacts/${id}`)).status, 200);
});

test('contact permissions are enforced', async (t) => {
  const { agents, db } = await setup(t);
  const { agent, send } = agents['employee@valuecraftminds.com'];
  await db.query(
    `DELETE FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE code = 'EMPLOYEE')
       AND permission_id IN (SELECT id FROM permissions WHERE code IN ('contacts.delete', 'contacts.create'))`,
  );
  assert.equal(
    (await send('post', '/api/contacts', { email: 'x@y.com' })).status,
    403,
  );
  assert.equal((await agent.get('/api/contacts')).status, 200);
});

test('suggestions combine own contacts and active colleagues', async (t) => {
  const { agents, createUser } = await setup(t);
  await createUser({
    email: 'nirosha@valuecraftminds.com',
    fullName: 'Nirosha Fernando',
  });
  await createUser({
    email: 'nimal.old@valuecraftminds.com',
    fullName: 'Nimal Old',
    status: 'INACTIVE',
  });
  const { agent, send } = agents['employee@valuecraftminds.com'];
  await send('post', '/api/contacts', {
    displayName: 'Nirmala Client',
    email: 'nirmala@client.com',
    isFavorite: true,
  });

  const res = await agent.get('/api/contacts/suggest?q=nir');
  assert.equal(res.status, 200);
  const list = res.body.data.suggestions;
  assert.deepEqual(
    list.map((s) => [s.email, s.source]),
    [
      ['nirmala@client.com', 'contact'],
      ['nirosha@valuecraftminds.com', 'directory'],
    ],
  );
  const all = await agent.get('/api/contacts/suggest?q=nimal');
  assert.ok(
    !all.body.data.suggestions.some(
      (s) => s.email === 'nimal.old@valuecraftminds.com',
    ),
  );
  assert.ok(
    !all.body.data.suggestions.some(
      (s) => s.email === 'employee@valuecraftminds.com',
    ),
    'self excluded',
  );
  assert.equal((await agent.get('/api/contacts/suggest?q=')).status, 422);
});

// --------------------------------------------------------------- signatures

test('placeholders are filled with escaped values and unknown ones removed', () => {
  const html = renderSignature(
    '<p><strong>{{full_name}}</strong><br>{{ job_title }} · {{department}}<br>{{unknown}}<a href="mailto:{{email}}">{{email}}</a></p>',
    {
      full_name: 'Roshan <script>alert(1)</script>',
      job_title: 'Associate Technical Lead',
      department: '',
      email: 'roshan@valuecraftminds.com',
    },
  );
  assert.match(html, /Roshan &lt;script&gt;/);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /Associate Technical Lead/);
  assert.match(html, /href="mailto:roshan@valuecraftminds\.com"/);
  assert.doesNotMatch(html, /\{\{/);
});

test('company template is seeded, rendered per user and admin-only to change', async (t) => {
  const { agents, db } = await setup(t, [
    {
      email: 'employee@valuecraftminds.com',
      role: 'EMPLOYEE',
      fullName: 'Nimal Perera',
    },
    {
      email: 'admin@valuecraftminds.com',
      role: 'ADMIN',
      fullName: 'Roshan Srimal',
    },
  ]);
  await db.query(
    `UPDATE users SET job_title = 'Associate Technical Lead' WHERE email = 'admin@valuecraftminds.com'`,
  );
  const employee = agents['employee@valuecraftminds.com'];
  const admin = agents['admin@valuecraftminds.com'];

  const mine = await admin.agent.get('/api/signatures/me');
  assert.equal(mine.status, 200);
  assert.equal(mine.body.data.mode, 'company');
  assert.match(mine.body.data.active, /Roshan Srimal/);
  assert.match(mine.body.data.active, /Associate Technical Lead/);
  assert.match(mine.body.data.active, /ValueCraft Minds/);

  const denied = await employee.send('put', '/api/signatures/company', {
    html: '<p>x</p>',
  });
  assert.equal(denied.status, 403);

  const updated = await admin.send('put', '/api/signatures/company', {
    html: '<p>{{full_name}}<script>steal()</script><img src="https://valuecraftminds.com/logo.png"></p>',
  });
  assert.equal(updated.status, 200);
  assert.doesNotMatch(updated.body.data.html, /script/);
  assert.match(
    updated.body.data.html,
    /\{\{full_name\}\}/,
    'placeholders survive sanitization',
  );
  assert.match(updated.body.data.html, /logo\.png/);

  const audit = await db.query(
    `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'signature.company_changed'`,
  );
  assert.equal(audit.rows[0].n, 1);

  const employeeSig = await employee.agent.get('/api/signatures/me');
  assert.match(employeeSig.body.data.active, /Nimal Perera/);
});

test('users can write their own signature and choose which one is used', async (t) => {
  const { agents } = await setup(t);
  const { agent, send } = agents['employee@valuecraftminds.com'];

  const early = await send('put', '/api/signatures/me', { mode: 'own' });
  assert.equal(early.status, 422);
  assert.equal(early.body.error.code, 'SIGNATURE_EMPTY');

  const saved = await send('put', '/api/signatures/me', {
    html: '<p>Cheers,<br>{{full_name}}<iframe src="x"></iframe></p>',
    mode: 'own',
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.data.mode, 'own');
  assert.match(saved.body.data.active, /Cheers,<br \/>Nimal Perera/);
  assert.doesNotMatch(saved.body.data.own.html, /iframe/);

  const none = await send('put', '/api/signatures/me', { mode: 'none' });
  assert.equal(none.body.data.active, '');

  const preview = await send('post', '/api/signatures/preview', {
    html: '<b>{{email}}</b>',
  });
  assert.equal(preview.body.data.html, '<b>employee@valuecraftminds.com</b>');

  const bad = await send('put', '/api/signatures/me', { mode: 'fancy' });
  assert.equal(bad.status, 422);
  assert.equal((await agent.get('/api/signatures/me')).body.data.mode, 'none');
});

// ------------------------------------------------ preferences and profile

test('preferences default, persist and validate', async (t) => {
  const { agents } = await setup(t);
  const { agent, send } = agents['employee@valuecraftminds.com'];

  const defaults = await agent.get('/api/preferences');
  assert.deepEqual(defaults.body.data.preferences, {
    theme: 'system',
    messagesPerPage: 50,
    density: 'comfortable',
    signatureMode: 'company',
  });

  const saved = await send('put', '/api/preferences', {
    theme: 'dark',
    messagesPerPage: 25,
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.preferences.theme, 'dark');
  const again = await send('put', '/api/preferences', { density: 'compact' });
  assert.equal(
    again.body.data.preferences.theme,
    'dark',
    'partial update keeps other values',
  );
  assert.equal(again.body.data.preferences.density, 'compact');

  assert.equal(
    (await send('put', '/api/preferences', { messagesPerPage: 1000 })).status,
    422,
  );
  assert.equal(
    (await send('put', '/api/preferences', { theme: 'neon' })).status,
    422,
  );
  assert.equal((await send('put', '/api/preferences', {})).status, 422);
});

test('users can edit their display name and phone only, with an audit record', async (t) => {
  const { agents, db } = await setup(t);
  const { agent, send } = agents['employee@valuecraftminds.com'];

  const res = await send('patch', '/api/profile', {
    displayName: 'Nimal P.',
    phone: '+94 11 234 5678',
    email: 'takeover@evil.com',
    jobTitle: 'CEO',
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.user.displayName, 'Nimal P.');
  assert.equal(res.body.data.user.phone, '+94 11 234 5678');
  assert.equal(res.body.data.user.email, 'employee@valuecraftminds.com');
  assert.equal(res.body.data.user.jobTitle, null);

  assert.equal(
    (await send('patch', '/api/profile', { phone: 'call me maybe' })).status,
    422,
  );
  const cleared = await send('patch', '/api/profile', { displayName: '' });
  assert.equal(cleared.body.data.user.displayName, null);

  const me = await agent.get('/api/profile');
  assert.equal(me.body.data.user.phone, '+94 11 234 5678');
  const audit = await db.query(
    `SELECT metadata FROM audit_logs WHERE action = 'user.updated' ORDER BY id`,
  );
  assert.equal(audit.rows.length, 2);
  assert.deepEqual(audit.rows[0].metadata.fields.sort(), [
    'displayName',
    'phone',
  ]);
});
