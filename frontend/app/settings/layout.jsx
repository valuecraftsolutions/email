'use client';

import AppShell from '@/components/layout/AppShell';
import RequireAuth from '@/components/layout/RequireAuth';
import { MailboxProvider } from '@/components/providers/MailboxProvider';
import SettingsNav from '@/components/settings/SettingsNav';

export default function SettingsLayout({ children }) {
  return (
    <RequireAuth>
      <MailboxProvider>
        <AppShell sidebar={<SettingsNav />}>
          <div className="page">{children}</div>
        </AppShell>
      </MailboxProvider>
    </RequireAuth>
  );
}
