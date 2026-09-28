'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import ThemeToggle from '@/components/layout/ThemeToggle';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import { FullPageLoader } from '@/components/ui/Feedback';
import TextField from '@/components/ui/TextField';
import { safeNextPath } from '@/utils/format';

export default function LoginForm() {
  const { status, login } = useAuth();
  const router = useRouter();
  const nextPath = safeNextPath(useSearchParams().get('next'));
  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace(nextPath);
  }, [status, nextPath, router]);

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setFieldErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    if (inFlight.current) return; // guards against double submission
    const errs = {};
    if (!form.email.trim()) errs.email = 'Email is required.';
    if (!form.password) errs.password = 'Password is required.';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await login(form.email.trim(), form.password);
      router.replace(nextPath);
    } catch (err) {
      setError(err.message);
      if (err.code === 'VALIDATION_FAILED') setFieldErrors(err.fieldErrors());
      setForm((f) => ({ ...f, password: '' }));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (status === 'loading' || status === 'authenticated')
    return <FullPageLoader />;

  return (
    <div className="auth-page">
      <div className="auth-page__theme">
        <ThemeToggle />
      </div>
      <main className="auth-card">
        <div className="auth-card__brand">
          <span className="brand__mark brand__mark--lg" aria-hidden="true">
            V
          </span>
          <div>
            <h1 className="auth-card__title">Sign in to ValueCraft Mail</h1>
            <p className="auth-card__subtitle">
              Use your ValueCraft Minds work account.
            </p>
          </div>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <form className="form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Work email"
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            placeholder="name@valuecraftminds.com"
            value={form.email}
            onChange={update('email')}
            error={fieldErrors.email}
            autoFocus
            required
          />
          <TextField
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={form.password}
            onChange={update('password')}
            error={fieldErrors.password}
            required
          />
          <Button
            type="submit"
            loading={submitting}
            className="btn--block"
            icon={Lock}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="auth-card__footnote">
          <Mail size={14} aria-hidden="true" /> Trouble signing in? Contact your
          ValueCraft Minds administrator.
        </p>
      </main>
    </div>
  );
}
