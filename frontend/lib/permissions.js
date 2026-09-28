/**
 * Frontend permission checks only shape navigation. The API enforces every
 * permission independently; these lists must never be treated as security.
 */
export const ADMIN_AREA_PERMISSIONS = [
  'users.read',
  'roles.read',
  'mailboxes.read',
  'audit.read',
  'settings.read',
  'signatures.manage_company',
];

export const ADMIN_NAV = [
  {
    href: '/admin',
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    anyOf: ADMIN_AREA_PERMISSIONS,
    ready: true,
  },
  {
    href: '/admin/users',
    label: 'Users',
    icon: 'Users',
    anyOf: ['users.read'],
  },
  {
    href: '/admin/roles',
    label: 'Roles & Permissions',
    icon: 'ShieldCheck',
    anyOf: ['roles.read'],
    ready: true,
  },
  {
    href: '/admin/mailboxes',
    label: 'Mailboxes',
    icon: 'Inbox',
    anyOf: ['mailboxes.read'],
  },
  {
    href: '/admin/signatures',
    label: 'Email Signatures',
    icon: 'PenLine',
    anyOf: ['signatures.manage_company'],
    ready: true,
  },
  {
    href: '/admin/contacts',
    label: 'Contacts',
    icon: 'Contact',
    anyOf: ['users.read'],
  },
  {
    href: '/admin/audit-logs',
    label: 'Audit Logs',
    icon: 'ScrollText',
    anyOf: ['audit.read'],
  },
  {
    href: '/admin/settings',
    label: 'Settings',
    icon: 'Settings',
    anyOf: ['settings.read'],
  },
];
