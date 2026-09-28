'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  AlertOctagon,
  Archive,
  ChevronDown,
  Contact,
  File,
  Folder,
  Inbox,
  PenSquare,
  Send,
  Star,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useMailbox } from '@/components/providers/MailboxProvider';
import Button from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Feedback';
import { useCompose } from './ComposeProvider';
import { SEARCH_KEYS } from './MailWorkspace';

const SYSTEM_FOLDERS = [
  { role: 'inbox', label: 'Inbox', Icon: Inbox },
  { role: 'starred', label: 'Starred', Icon: Star, virtual: true },
  { role: 'sent', label: 'Sent', Icon: Send },
  { role: 'drafts', label: 'Drafts', Icon: File },
  { role: 'spam', label: 'Spam', Icon: AlertOctagon },
  { role: 'trash', label: 'Trash', Icon: Trash2 },
  { role: 'archive', label: 'Archive', Icon: Archive },
];

function Count({ value, label = 'unread' }) {
  if (!value) return null;
  return (
    <span className="nav-item__count" aria-label={`${value} ${label}`}>
      {value > 999 ? '999+' : value}
    </span>
  );
}

/** Mail navigation with provider folders and unread counts. */
export default function MailSidebar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { loading, connected, folders } = useMailbox();
  const { openCompose } = useCompose();
  const { can } = useAuth();
  const [foldersOpen, setFoldersOpen] = useState(true);

  const byRole = Object.fromEntries(
    folders.filter((f) => f.role).map((f) => [f.role, f]),
  );
  const customFolders = folders.filter((f) => !f.role);
  const current =
    pathname === '/' ? (params.get('folder') || 'inbox').toLowerCase() : null;
  const isActive = (key) =>
    current !== null &&
    current === key.toLowerCase() &&
    !SEARCH_KEYS.some((k) => params.get(k));

  return (
    <nav className="sidebar__nav">
      <Button
        icon={PenSquare}
        className="sidebar__compose"
        disabled={!connected}
        data-close-nav
        title={
          connected ? undefined : 'Available once your mailbox is connected'
        }
        onClick={() => openCompose({})}
      >
        Compose
      </Button>
      <ul className="nav-list">
        {SYSTEM_FOLDERS.filter(
          (f) => f.virtual || byRole[f.role] || f.role === 'inbox',
        ).map(({ role, label, Icon }) => {
          const folder = byRole[role];
          const isDrafts = role === 'drafts';
          const content = (
            <>
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
              <Count
                value={isDrafts ? folder?.total : folder?.unread}
                label={isDrafts ? 'drafts' : 'unread'}
              />
            </>
          );
          return (
            <li key={role}>
              {connected || role === 'inbox' ? (
                <Link
                  href={role === 'inbox' ? '/' : `/?folder=${role}`}
                  className="nav-item"
                  aria-current={isActive(role) ? 'page' : undefined}
                >
                  {content}
                </Link>
              ) : (
                <span
                  className="nav-item nav-item--disabled"
                  aria-disabled="true"
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
        {can('contacts.read') && (
          <li>
            <Link
              href="/contacts"
              className="nav-item"
              aria-current={pathname === '/contacts' ? 'page' : undefined}
            >
              <Contact size={17} aria-hidden="true" />
              <span>Contacts</span>
            </Link>
          </li>
        )}
      </ul>
      <div className="nav-group">
        <button
          type="button"
          className="nav-group__toggle"
          aria-expanded={foldersOpen}
          onClick={() => setFoldersOpen((v) => !v)}
        >
          <ChevronDown
            size={15}
            aria-hidden="true"
            className={foldersOpen ? '' : 'rotate-90n'}
          />
          Folders
        </button>
        {foldersOpen &&
          (loading ? (
            <div className="stack-sm nav-group__loading">
              <Skeleton width="70%" />
              <Skeleton width="55%" />
            </div>
          ) : customFolders.length ? (
            <ul className="nav-list">
              {customFolders.map((folder) => (
                <li key={folder.path}>
                  <Link
                    href={`/?folder=${encodeURIComponent(folder.path)}`}
                    className="nav-item"
                    title={folder.path}
                    aria-current={isActive(folder.path) ? 'page' : undefined}
                  >
                    <Folder size={16} aria-hidden="true" />
                    <span className="nav-item__label">{folder.name}</span>
                    <Count value={folder.unread} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nav-group__empty">
              <Folder size={14} aria-hidden="true" />
              {connected
                ? 'No custom folders.'
                : 'Folders from your mailbox will appear here.'}
            </p>
          ))}
      </div>
    </nav>
  );
}
