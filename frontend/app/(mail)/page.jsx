import { Suspense } from 'react';
import MailHome from '@/components/mail/MailHome';
import { FullPageLoader } from '@/components/ui/Feedback';

export const metadata = { title: 'Mail' };

export default function MailPage() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <MailHome />
    </Suspense>
  );
}
