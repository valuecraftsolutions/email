'use client';

import AdminNav from '@/components/admin/AdminNav';
import AppShell from '@/components/layout/AppShell';
import RequireAuth from '@/components/layout/RequireAuth';
import { ADMIN_AREA_PERMISSIONS } from '@/lib/permissions';

export default function AdminLayout({ children }) {
  return (
    <RequireAuth anyOf={ADMIN_AREA_PERMISSIONS}>
      <AppShell sidebar={<AdminNav />} brandSuffix="Admin" brandHref="/admin">
        <div className="page page--wide">{children}</div>
      </AppShell>
    </RequireAuth>
  );
}
