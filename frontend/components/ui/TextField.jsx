'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function TextField({
  label,
  error,
  hint,
  type = 'text',
  className = '',
  ...props
}) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  const describedBy =
    [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className={`field ${error ? 'field--invalid' : ''} ${className}`}>
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className="field__control">
        <input
          id={id}
          type={isPassword && reveal ? 'text' : type}
          className="field__input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            className="field__toggle"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            aria-pressed={reveal}
          >
            {reveal ? (
              <EyeOff size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
