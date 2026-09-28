'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Contact as ContactIcon,
  Mail,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { useCompose } from '@/components/mail/ComposeProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { contactService } from '@/services/productivityService';
import { initials } from '@/utils/format';
import ContactDialog from './ContactDialog';

const PAGE_SIZE = 50;

export default function ContactsView() {
  const { can } = useAuth();
  const { openCompose } = useCompose();
  const notify = useToast();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [page, setPage] = useState(1);
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: null,
  });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await contactService.list(
        { q, favorite, page, pageSize: PAGE_SIZE },
        { signal: controller.signal },
      );
      setState({ loading: false, data, error: null });
    } catch (error) {
      if (error.name !== 'AbortError')
        setState({ loading: false, data: null, error });
    }
  }, [q, favorite, page]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFavorite = async (contact) => {
    try {
      await contactService.update(contact.id, {
        isFavorite: !contact.isFavorite,
      });
      load();
    } catch (error) {
      notify(error.message, { tone: 'error' });
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await contactService.remove(deleting.id);
      notify('Contact deleted.', { tone: 'success' });
      setDeleting(null);
      load();
    } catch (error) {
      notify(error.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const contacts = state.data?.contacts ?? [];
  const total = state.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page page--wide contacts">
      <header className="page-header page-header--row">
        <div>
          <h1 className="page-header__title">Contacts</h1>
          <p className="page-header__subtitle">
            Your personal address book. Only you can see these contacts.
          </p>
        </div>
        {can('contacts.create') && (
          <Button icon={Plus} onClick={() => setEditing({})}>
            New contact
          </Button>
        )}
      </header>

      <div className="filter-bar">
        <div className="search search--inline">
          <Search size={16} aria-hidden="true" className="search__icon" />
          <label htmlFor="contact-search" className="sr-only">
            Search contacts
          </label>
          <input
            id="contact-search"
            type="search"
            className="search__input"
            placeholder="Search by name, email or company"
            value={search}
            maxLength={200}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          className={`toolbar-button ${favorite ? 'is-pressed' : ''}`}
          aria-pressed={favorite}
          onClick={() => {
            setFavorite((v) => !v);
            setPage(1);
          }}
        >
          <Star size={15} aria-hidden="true" /> Favorites
        </button>
      </div>

      {state.error ? (
        <Alert
          tone="error"
          title="Could not load contacts"
          action={
            <Button variant="secondary" onClick={load}>
              Retry
            </Button>
          }
        >
          {state.error.message}
        </Alert>
      ) : state.loading && !state.data ? (
        <div className="panel stack-sm" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={40} />
          ))}
        </div>
      ) : !contacts.length ? (
        <div className="panel">
          <EmptyState
            icon={ContactIcon}
            title={q || favorite ? 'No matching contacts' : 'No contacts yet'}
            action={
              !q && !favorite && can('contacts.create') ? (
                <Button icon={Plus} onClick={() => setEditing({})}>
                  Add your first contact
                </Button>
              ) : null
            }
          >
            {q || favorite
              ? 'Try a different search.'
              : 'Contacts you add appear here and as suggestions when you write mail.'}
          </EmptyState>
        </div>
      ) : (
        <div className="panel panel--flush">
          <ul className="contact-list">
            {contacts.map((contact) => (
              <li key={contact.id} className="contact-row">
                <span className="avatar" aria-hidden="true">
                  {initials(contact.name || '?')}
                </span>
                <div className="contact-row__main">
                  <p className="contact-row__name">{contact.name}</p>
                  <p className="contact-row__meta">
                    {[
                      contact.email,
                      [contact.jobTitle, contact.company]
                        .filter(Boolean)
                        .join(', '),
                      contact.phone,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="contact-row__actions">
                  <button
                    type="button"
                    className={`star-button ${contact.isFavorite ? 'is-starred' : ''}`}
                    aria-pressed={contact.isFavorite}
                    aria-label={
                      contact.isFavorite
                        ? `Remove ${contact.name} from favorites`
                        : `Add ${contact.name} to favorites`
                    }
                    disabled={!can('contacts.update')}
                    onClick={() => toggleFavorite(contact)}
                  >
                    <Star size={16} aria-hidden="true" />
                  </button>
                  {contact.email && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Email ${contact.name}`}
                      title="Write email"
                      onClick={() => openCompose({ to: [contact.email] })}
                    >
                      <Mail size={16} aria-hidden="true" />
                    </button>
                  )}
                  {can('contacts.update') && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit ${contact.name}`}
                      title="Edit"
                      onClick={() => setEditing(contact)}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                  )}
                  {can('contacts.delete') && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete ${contact.name}`}
                      title="Delete"
                      onClick={() => setDeleting(contact)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {lastPage > 1 && (
            <div className="pager">
              <span>
                Page {page} of {lastPage} · {total} contacts
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Next page"
                disabled={page >= lastPage}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}

      <ContactDialog
        open={Boolean(editing)}
        contact={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved, created) => {
          setEditing(null);
          notify(
            created ? `${saved.name} added to contacts.` : 'Contact updated.',
            { tone: 'success' },
          );
          load();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name ?? 'contact'}?`}
        confirmLabel="Delete"
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      >
        This contact will be removed from your address book.
      </ConfirmDialog>
    </div>
  );
}
