'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Building2, User, X } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { contactService } from '@/services/productivityService';
import { isEmail } from '@/utils/mail';

const SEPARATORS = /[,;\s]+/;
const DEBOUNCE_MS = 200;

/**
 * Chip-style email input with contact suggestions (combobox pattern).
 * Commits typed addresses on Enter, comma, semicolon, space, blur or paste.
 */
export default function RecipientInput({
  label,
  value,
  onChange,
  error,
  autoFocus,
}) {
  const id = useId();
  const listId = `${id}-suggestions`;
  const { can } = useAuth();
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [active, setActive] = useState(-1);
  const abortRef = useRef(null);
  const canSuggest = can('contacts.read');

  useEffect(() => {
    const term = draft.trim();
    if (!canSuggest || !term || SEPARATORS.test(term)) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const { suggestions: found } = await contactService.suggest(term, {
          signal: controller.signal,
        });
        setSuggestions(found.filter((s) => !value.includes(s.email)));
        setActive(-1);
      } catch {
        setSuggestions([]);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, canSuggest, value]);

  const add = (addresses) => {
    const next = [...value];
    for (const address of addresses)
      if (!next.includes(address)) next.push(address);
    onChange(next);
    setDraft('');
    setSuggestions([]);
  };

  const commit = (text) => {
    const parts = text
      .split(SEPARATORS)
      .map((p) => p.trim().replace(/^<|>$/g, '').toLowerCase())
      .filter(Boolean);
    if (parts.length) add(parts);
  };

  const open = suggestions.length > 0;

  const onKeyDown = (e) => {
    if (open && e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (open && e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (open && e.key === 'Escape') {
      e.stopPropagation();
      setSuggestions([]);
    } else if (open && active >= 0 && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault();
      add([suggestions[active].email]);
    } else if (
      ['Enter', ',', ';', ' ', 'Tab'].includes(e.key) &&
      draft.trim()
    ) {
      if (e.key !== 'Tab') e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={`recipient-field ${error ? 'recipient-field--invalid' : ''}`}
    >
      <label htmlFor={id} className="recipient-field__label">
        {label}
      </label>
      <div className="recipient-field__control">
        {value.map((address) => (
          <span
            key={address}
            className={`chip ${isEmail(address) ? '' : 'chip--invalid'}`}
            title={isEmail(address) ? address : 'Invalid email address'}
          >
            {address}
            <button
              type="button"
              className="chip__remove"
              onClick={() => onChange(value.filter((a) => a !== address))}
              aria-label={`Remove ${address}`}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <div className="recipient-field__combo">
          <input
            id={id}
            type="email"
            multiple
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              active >= 0 ? `${listId}-${active}` : undefined
            }
            className="recipient-field__input"
            value={draft}
            autoFocus={autoFocus}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => {
              commit(draft);
              setSuggestions([]);
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (SEPARATORS.test(text)) {
                e.preventDefault();
                commit(`${draft} ${text}`);
              }
            }}
            aria-invalid={error ? true : undefined}
          />
          {open && (
            <ul
              id={listId}
              role="listbox"
              className="suggestions"
              aria-label="Suggestions"
            >
              {suggestions.map((s, index) => (
                <li
                  key={s.email}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={`suggestions__item ${index === active ? 'is-active' : ''}`}
                  // mousedown (not click) so the input does not blur first
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add([s.email]);
                  }}
                  onMouseEnter={() => setActive(index)}
                >
                  {s.source === 'directory' ? (
                    <Building2 size={15} aria-hidden="true" />
                  ) : (
                    <User size={15} aria-hidden="true" />
                  )}
                  <span className="suggestions__text">
                    <span className="suggestions__name">{s.name}</span>
                    <span className="suggestions__email">
                      {s.email}
                      {s.detail ? ` · ${s.detail}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
