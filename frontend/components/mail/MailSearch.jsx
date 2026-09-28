'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import Button from '@/components/ui/Button';

const EMPTY = {
  from: '',
  to: '',
  subject: '',
  q: '',
  since: '',
  before: '',
  unread: false,
  hasAttachment: false,
};
const KEYS = Object.keys(EMPTY);

const fromParams = (params) =>
  Object.fromEntries(
    KEYS.map((k) => [
      k,
      typeof EMPTY[k] === 'boolean'
        ? params.get(k) === 'true'
        : (params.get(k) ?? ''),
    ]),
  );

/**
 * Top-bar search with an advanced panel (sender, recipient, subject, words,
 * date range, unread, attachments). Searches the current folder; the Starred
 * view searches the inbox.
 */
export default function MailSearch() {
  const params = useSearchParams();
  const router = useRouter();
  const [quick, setQuick] = useState(params.get('q') ?? '');
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState(() => fromParams(params));
  const rootRef = useRef(null);
  const active = KEYS.some((k) => params.get(k));

  useEffect(() => {
    setQuick(params.get('q') ?? '');
    setForm(fromParams(params));
  }, [params]);

  useEffect(() => {
    if (!panelOpen) return;
    const close = (e) =>
      !rootRef.current?.contains(e.target) && setPanelOpen(false);
    const onKey = (e) => e.key === 'Escape' && setPanelOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [panelOpen]);

  const go = (criteria) => {
    const next = new URLSearchParams();
    const folder = params.get('folder');
    if (folder && folder !== 'starred') next.set('folder', folder);
    for (const [key, value] of Object.entries(criteria)) {
      const text =
        typeof value === 'string' ? value.trim().slice(0, 200) : value;
      if (text) next.set(key, String(text));
    }
    setPanelOpen(false);
    router.push(`/${next.toString() ? `?${next}` : ''}`);
  };

  const set = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  return (
    <div className="search" ref={rootRef}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go({ ...fromParams(params), q: quick });
        }}
      >
        <Search size={16} aria-hidden="true" className="search__icon" />
        <label htmlFor="global-search" className="sr-only">
          Search mail
        </label>
        <input
          id="global-search"
          type="search"
          className="search__input search__input--with-actions"
          placeholder="Search mail..."
          value={quick}
          maxLength={200}
          onChange={(e) => setQuick(e.target.value)}
        />
      </form>
      <div className="search__actions">
        {active && (
          <button
            type="button"
            className="icon-button icon-button--sm"
            aria-label="Clear search"
            onClick={() => go({})}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className={`icon-button icon-button--sm ${panelOpen ? 'is-pressed' : ''}`}
          aria-label="Advanced search"
          aria-expanded={panelOpen}
          aria-controls="advanced-search"
          title="Advanced search"
          onClick={() => setPanelOpen((v) => !v)}
        >
          <SlidersHorizontal size={15} aria-hidden="true" />
        </button>
      </div>
      {panelOpen && (
        <form
          id="advanced-search"
          className="search-panel"
          aria-label="Advanced search"
          onSubmit={(e) => {
            e.preventDefault();
            go(form);
          }}
        >
          <div className="search-panel__grid">
            {[
              ['from', 'From', 'name or address'],
              ['to', 'To', 'name or address'],
              ['subject', 'Subject', ''],
              ['q', 'Has the words', ''],
            ].map(([key, label, placeholder]) => (
              <label key={key} className="search-panel__field">
                <span>{label}</span>
                <input
                  className="field__input"
                  value={form[key]}
                  maxLength={200}
                  placeholder={placeholder}
                  onChange={set(key)}
                />
              </label>
            ))}
            <label className="search-panel__field">
              <span>After</span>
              <input
                className="field__input"
                type="date"
                value={form.since}
                onChange={set('since')}
              />
            </label>
            <label className="search-panel__field">
              <span>Before</span>
              <input
                className="field__input"
                type="date"
                value={form.before}
                onChange={set('before')}
              />
            </label>
          </div>
          <div className="search-panel__checks">
            <label>
              <input
                type="checkbox"
                className="checkbox"
                checked={form.unread}
                onChange={set('unread')}
              />{' '}
              Unread only
            </label>
            <label>
              <input
                type="checkbox"
                className="checkbox"
                checked={form.hasAttachment}
                onChange={set('hasAttachment')}
              />{' '}
              Has attachments
            </label>
          </div>
          <div className="dialog__actions">
            <Button variant="secondary" onClick={() => setForm(EMPTY)}>
              Reset
            </Button>
            <Button type="submit" icon={Search}>
              Search
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
