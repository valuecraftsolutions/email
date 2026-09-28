'use client';

import { Suspense } from 'react';
import AppShell from '@/components/layout/AppShell';
import RequireAuth from '@/components/layout/RequireAuth';
import { ComposeProvider } from '@/components/mail/ComposeProvider';
import MailSidebar from '@/components/mail/MailSidebar';
import { MailboxProvider } from '@/components/providers/MailboxProvider';

export default function MailLayout({ children }) {
  return (
    <RequireAuth anyOf={['mail.read_own']}>
      <MailboxProvider>
        <ComposeProvider>
          <AppShell
            sidebar={
              <Suspense fallback={null}>
                <MailSidebar />
              </Suspense>
            }
          >
            {children}
          </AppShell>
        </ComposeProvider>
      </MailboxProvider>
    </RequireAuth>
  );
}
