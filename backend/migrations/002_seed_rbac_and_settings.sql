-- 002_seed_rbac_and_settings.sql
-- Reference data: system roles, granular permissions, default role grants and base settings.
-- Authorization is always evaluated from these tables, never from role names in code.

INSERT INTO roles (code, name, description, is_system) VALUES
  ('SUPER_ADMIN', 'Super Admin', 'Full control of the application, including roles and system settings.', true),
  ('ADMIN', 'Admin', 'Manages users, mailboxes, company signatures and reviews audit logs.', true),
  ('EMPLOYEE', 'Employee', 'Uses webmail, contacts and personal signatures.', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, module, name, description, sort_order) VALUES
  ('mail.read_own',             'mail',       'Read own mail',            'Read messages in mailboxes assigned to the user.', 10),
  ('mail.send',                 'mail',       'Send mail',                'Send messages from assigned mailboxes.', 20),
  ('mail.delete_own',           'mail',       'Delete own mail',          'Delete messages in assigned mailboxes.', 30),
  ('mail.manage_folders',       'mail',       'Manage folders',           'Create, rename and delete mailbox folders.', 40),
  ('contacts.read',             'contacts',   'View contacts',            'View own contacts.', 10),
  ('contacts.create',           'contacts',   'Create contacts',          'Create own contacts.', 20),
  ('contacts.update',           'contacts',   'Update contacts',          'Edit own contacts.', 30),
  ('contacts.delete',           'contacts',   'Delete contacts',          'Delete own contacts.', 40),
  ('signatures.read',           'signatures', 'View signatures',          'View company template and own signature.', 10),
  ('signatures.manage_own',     'signatures', 'Manage own signature',     'Edit the user''s personal signature.', 20),
  ('signatures.manage_company', 'signatures', 'Manage company signature', 'Edit the company signature template.', 30),
  ('users.read',                'users',      'View users',               'View application users.', 10),
  ('users.create',              'users',      'Create users',             'Create application users.', 20),
  ('users.update',              'users',      'Update users',             'Edit application users and role assignments.', 30),
  ('users.disable',             'users',      'Disable users',            'Disable or suspend application users.', 40),
  ('roles.read',                'roles',      'View roles',               'View roles and the permission matrix.', 10),
  ('roles.manage',              'roles',      'Manage roles',             'Create roles and change role permissions.', 20),
  ('mailboxes.read',            'mailboxes',  'View mailboxes',           'View mailbox mappings and connection status.', 10),
  ('mailboxes.manage',          'mailboxes',  'Manage mailboxes',         'Create mailbox mappings and update credentials.', 20),
  ('audit.read',                'audit',      'View audit logs',          'Read the application audit trail.', 10),
  ('settings.read',             'settings',   'View settings',            'View application settings.', 10),
  ('settings.update',           'settings',   'Update settings',          'Change application and security settings.', 20)
ON CONFLICT (code) DO NOTHING;

-- SUPER_ADMIN: every permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

-- ADMIN: everything except role management and system settings changes.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'ADMIN' AND p.code NOT IN ('roles.manage', 'settings.update')
ON CONFLICT DO NOTHING;

-- EMPLOYEE: own mail, own contacts and own signature.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'EMPLOYEE' AND p.code IN (
  'mail.read_own', 'mail.send', 'mail.delete_own', 'mail.manage_folders',
  'contacts.read', 'contacts.create', 'contacts.update', 'contacts.delete',
  'signatures.read', 'signatures.manage_own'
)
ON CONFLICT DO NOTHING;

INSERT INTO system_settings (key, value, description) VALUES
  ('company.name', '"ValueCraft Minds"'::jsonb, 'Company name used in the UI and signatures.'),
  ('company.website', '"valuecraftminds.com"'::jsonb, 'Company website used in signatures.'),
  ('company.mail_domain', '"valuecraftminds.com"'::jsonb, 'Primary email domain for mailboxes.')
ON CONFLICT (key) DO NOTHING;
