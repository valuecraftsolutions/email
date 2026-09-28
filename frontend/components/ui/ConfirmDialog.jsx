'use client';

import { useEffect, useRef } from 'react';
import Button from './Button';

/**
 * Confirmation for destructive actions. Uses the native <dialog> element, which
 * provides focus containment, Escape to close and an inert background.
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="confirm-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!loading) onCancel();
      }}
    >
      <h2 id="confirm-dialog-title" className="dialog__title">
        {title}
      </h2>
      <div className="dialog__body">{children}</div>
      <div className="dialog__actions">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant={tone} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
