'use client';

import RequireAuth from '@/components/layout/RequireAuth';
import PermissionMatrix from '@/components/admin/PermissionMatrix';

export default function RolesPage() {
  return (
    <RequireAuth anyOf={['roles.read']}>
      <header className="page-header">
        <h1 className="page-header__title">Roles &amp; Permissions</h1>
        <p className="page-header__subtitle">
          Permissions granted to each role, read live from the database. The API
          enforces these grants on every request.
        </p>
      </header>
      <PermissionMatrix />
    </RequireAuth>
  );
}
