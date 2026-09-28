'use client';

import { useRef, useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import TextField from '@/components/ui/TextField';
import { authService } from '@/services/authService';

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function ChangePasswordForm() {
  const notify = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const errs = {};
    if (!form.currentPassword)
      errs.currentPassword = 'Enter your current password.';
    if (form.newPassword.length < 12)
      errs.newPassword = 'Use at least 12 characters.';
    if (form.newPassword !== form.confirmPassword)
      errs.confirmPassword = 'Passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const { revokedSessions } = await authService.changePassword(
        form.currentPassword,
        form.newPassword,
      );
      setForm(EMPTY);
      notify(
        revokedSessions
          ? `Password changed. ${revokedSessions} other session(s) signed out.`
          : 'Password changed.',
        { tone: 'success' },
      );
    } catch (err) {
      if (err.details?.length) setErrors(err.fieldErrors());
      else setError(err.message);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <form className="form form--narrow" onSubmit={handleSubmit} noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <input
        type="text"
        name="username"
        autoComplete="username"
        hidden
        readOnly
      />
      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={form.currentPassword}
        onChange={update('currentPassword')}
        error={errors.currentPassword}
      />
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters. A long passphrase is best."
        value={form.newPassword}
        onChange={update('newPassword')}
        error={errors.newPassword}
      />
      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={form.confirmPassword}
        onChange={update('confirmPassword')}
        error={errors.confirmPassword}
      />
      <div>
        <Button type="submit" loading={saving}>
          Update password
        </Button>
      </div>
    </form>
  );
}
