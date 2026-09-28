'use client';

import ContactsView from '@/components/contacts/ContactsView';
import RequireAuth from '@/components/layout/RequireAuth';

export default function ContactsPage() {
  return (
    <RequireAuth anyOf={['contacts.read']}>
      <ContactsView />
    </RequireAuth>
  );
}
