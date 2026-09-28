'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import { EmptyState, FullPageLoader } from '@/components/ui/Feedback';

/**
 * Client-side route guard for UX only. It hides screens the user cannot use;
 * the API independently rejects unauthenticated or unauthorized requests.
 */
export default function RequireAuth({ anyOf, children }) {
  const { status, error, canAny, refresh } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated')
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);

  if (status === 'loading' || status === 'unauthenticated')
    return <FullPageLoader />;

  if (status === 'error')
    return (
      <div className="full-page-center">
        <Alert
          tone="error"
          title="Unable to load your session"
          action={
            <Button variant="secondary" onClick={refresh}>
              Retry
            </Button>
          }
        >
          {error?.message}
        </Alert>
      </div>
    );

  if (anyOf && !canAny(...anyOf))
    return (
      <div className="full-page-center">
        <EmptyState
          icon={ShieldAlert}
          title="Access restricted"
          action={
            <Button variant="secondary" onClick={() => router.push('/')}>
              Go to mail
            </Button>
          }
        >
          Your account does not have permission to view this area.
        </EmptyState>
      </div>
    );

  return children;
}
