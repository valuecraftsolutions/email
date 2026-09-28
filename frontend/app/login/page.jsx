import { Suspense } from 'react';
import LoginForm from '@/components/auth/LoginForm';
import { FullPageLoader } from '@/components/ui/Feedback';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <LoginForm />
    </Suspense>
  );
}
