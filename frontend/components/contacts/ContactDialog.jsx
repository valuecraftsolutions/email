'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import TextField from '@/components/ui/TextField';
import { contactService } from '@/services/productivityService';
import { isEmail } from '@/utils/mail';

const FIELDS = [
  'firstName',
  'lastName',
  'displayName',
  'email',
  'phone',
  'company',
  'jobTitle',
  'notes',
];

const toForm = (contact) =>
  Object.fromEntries(FIELDS.map((f) => [f, contact?.[f] ?? '']));

/** Create / edit contact form in a native modal dialog. */
export default function ContactDialog({ open, contact, onClose, onSaved }) {
  const ref = useRef(null);
  const busy = useRef(false);
  const [form, setForm] = useState(toForm(contact));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      setForm(toForm(contact));
      setErrors({});
      setError(null);
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) dialog.close();
  }, [open, contact]);

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    const errs = {};
    if (
      !form.displayName.trim() &&
      !form.firstName.trim() &&
      !form.lastName.trim() &&
      !form.email.trim()
    )
      errs.displayName = 'Enter a name or an email address.';
    if (form.email.trim() && !isEmail(form.email))
      errs.email = 'Enter a valid email address.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const payload = Object.fromEntries(
        FIELDS.map((f) => [f, form[f].trim() || null]),
      );
      const { contact: saved } = contact?.id
        ? await contactService.update(contact.id, payload)
        : await contactService.create(payload);
      onSaved(saved, !contact?.id);
    } catch (err) {
      if (err.details?.length) setErrors(err.fieldErrors());
      setError(err.message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="dialog dialog--form"
      aria-labelledby="contact-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form onSubmit={submit} noValidate className="form">
        <div className="dialog__header">
          <h2 id="contact-dialog-title" className="dialog__title">
            {contact?.id ? 'Edit contact' : 'New contact'}
          </h2>
          <button
            type="button"
            className="icon-button icon-button--sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="form-grid">
          <TextField
            label="First name"
            value={form.firstName}
            onChange={set('firstName')}
            maxLength={100}
            error={errors.firstName}
          />
          <TextField
            label="Last name"
            value={form.lastName}
            onChange={set('lastName')}
            maxLength={100}
            error={errors.lastName}
          />
          <TextField
            label="Display name"
            hint="Shown in lists and suggestions. Defaults to first and last name."
            value={form.displayName}
            onChange={set('displayName')}
            maxLength={200}
            error={errors.displayName}
            className="form-grid__wide"
          />
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onChange={set('email')}
            maxLength={254}
            error={errors.email}
          />
          <TextField
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={set('phone')}
            maxLength={40}
            error={errors.phone}
          />
          <TextField
            label="Company"
            value={form.company}
            onChange={set('company')}
            maxLength={150}
            error={errors.company}
          />
          <TextField
            label="Job title"
            value={form.jobTitle}
            onChange={set('jobTitle')}
            maxLength={100}
            error={errors.jobTitle}
          />
          <div className="field form-grid__wide">
            <label htmlFor="contact-notes" className="field__label">
              Notes
            </label>
            <textarea
              id="contact-notes"
              className="field__input field__textarea"
              rows={3}
              maxLength={5000}
              value={form.notes}
              onChange={set('notes')}
            />
          </div>
        </div>
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {contact?.id ? 'Save changes' : 'Add contact'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
