'use client';

import { useRef, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import TextField from '@/components/ui/TextField';
import { preferenceService } from '@/services/productivityService';

export default function ProfileSettings() {
  const { user, refresh } = useAuth();
  const notify = useToast();
  const [form, setForm] = useState({
    displayName: user.displayName ?? '',
    phone: user.phone ?? '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await preferenceService.updateProfile({
        displayName: form.displayName.trim() || null,
        phone: form.phone.trim() || null,
      });
      await refresh();
      notify('Profile updated.', { tone: 'success' });
    } catch (err) {
      if (err.details?.length) setErrors(err.fieldErrors());
      else setError(err.message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const readOnly = [
    ['Full name', user.fullName],
    ['Email', user.email],
    ['User code', user.userCode],
    ['Job title', user.jobTitle],
    ['Department', user.department],
  ];

  return (
    <>
      <section className="panel" aria-labelledby="profile-heading">
        <div className="panel__header">
          <h2 id="profile-heading" className="panel__title">
            Account details
          </h2>
          <p className="panel__subtitle">
            Managed by your administrator. Contact them if anything is
            incorrect.
          </p>
        </div>
        <dl className="detail-list">
          {readOnly.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || '—'}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="panel" aria-labelledby="profile-edit-heading">
        <div className="panel__header">
          <h2 id="profile-edit-heading" className="panel__title">
            Your details
          </h2>
          <p className="panel__subtitle">
            Used in your email signature and shown to colleagues.
          </p>
        </div>
        <form className="form form--narrow" onSubmit={submit} noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <TextField
            label="Display name"
            hint={`Shown instead of "${user.fullName}" when set.`}
            value={form.displayName}
            maxLength={150}
            onChange={set('displayName')}
            error={errors.displayName}
          />
          <TextField
            label="Phone"
            type="tel"
            value={form.phone}
            maxLength={40}
            onChange={set('phone')}
            error={errors.phone}
          />
          <div>
            <Button type="submit" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
