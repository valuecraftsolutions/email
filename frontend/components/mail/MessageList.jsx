'use client';

import { useEffect, useRef } from 'react';
import {
  AlertOctagon,
  ChevronLeft,
  ChevronRight,
  Inbox,
  MailOpen,
  Mail,
  Paperclip,
  RefreshCw,
  SearchX,
  Star,
  Trash2,
  Undo2,
} from 'lucide-react';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { initials } from '@/utils/format';
import { displayName, formatListDate } from '@/utils/mail';
import MoveMenu from './MoveMenu';

function SelectAll({ checked, indeterminate, onChange, disabled }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label="Select all messages on this page"
    />
  );
}

export default function MessageList({
  title,
  role,
  state,
  selected,
  activeUid,
  folders,
  page,
  onSelect,
  onSelectAll,
  onOpen,
  onRefresh,
  onPage,
  actions,
  searchQuery,
}) {
  const { loading, error, data, refreshing } = state;
  const messages = data?.messages ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 50;
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  const selectedList = messages.filter((m) => selected.has(m.uid));
  const count = selectedList.length;
  const isOutgoing = role === 'sent' || role === 'drafts';

  return (
    <section className="mail-list" aria-label={`${title} messages`}>
      <header className="pane-header pane-header--list">
        <h1 className="pane-header__title">
          {searchQuery ? `Search: ${searchQuery}` : title}
        </h1>
        {total > 0 && (
          <span className="pane-header__meta">
            {from}–{to} of {total}
          </span>
        )}
      </header>

      <div className="list-toolbar" role="toolbar" aria-label="Message actions">
        <SelectAll
          checked={count > 0 && count === messages.length}
          indeterminate={count > 0 && count < messages.length}
          disabled={!messages.length}
          onChange={() => onSelectAll(count !== messages.length)}
        />
        {count === 0 ? (
          <button
            type="button"
            className="icon-button"
            onClick={onRefresh}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw
              size={16}
              aria-hidden="true"
              className={refreshing ? 'spin' : ''}
            />
          </button>
        ) : (
          <>
            <span className="list-toolbar__count">{count} selected</span>
            <button
              type="button"
              className="icon-button"
              title="Mark as read"
              aria-label="Mark as read"
              onClick={() => actions.markRead(selectedList, true)}
            >
              <MailOpen size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              title="Mark as unread"
              aria-label="Mark as unread"
              onClick={() => actions.markRead(selectedList, false)}
            >
              <Mail size={16} aria-hidden="true" />
            </button>
            <MoveMenu
              compact
              folders={folders}
              currentPath={data?.folder}
              onMove={(folder) => actions.move(selectedList, folder)}
            />
            {role === 'spam' ? (
              <button
                type="button"
                className="icon-button"
                title="Not spam"
                aria-label="Not spam"
                onClick={() => actions.notSpam(selectedList)}
              >
                <Undo2 size={16} aria-hidden="true" />
              </button>
            ) : (
              actions.canSpam && (
                <button
                  type="button"
                  className="icon-button"
                  title="Report spam"
                  aria-label="Report spam"
                  onClick={() => actions.spam(selectedList)}
                >
                  <AlertOctagon size={16} aria-hidden="true" />
                </button>
              )
            )}
            {role === 'trash' && (
              <button
                type="button"
                className="icon-button"
                title="Restore to Inbox"
                aria-label="Restore to Inbox"
                onClick={() => actions.restore(selectedList)}
              >
                <Undo2 size={16} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              title="Delete"
              aria-label="Delete"
              onClick={() => actions.remove(selectedList)}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </>
        )}
        <span className="list-toolbar__spacer" />
        <button
          type="button"
          className="icon-button"
          aria-label="Newer messages"
          title="Newer"
          disabled={page <= 1 || loading}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Older messages"
          title="Older"
          disabled={to >= total || loading}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="mail-list__body">
        {loading && !data ? (
          <ul className="message-rows" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="message-row message-row--skeleton">
                <Skeleton width={32} height={32} className="skeleton--round" />
                <div className="stack-sm grow">
                  <Skeleton width="45%" />
                  <Skeleton width="85%" height={12} />
                </div>
              </li>
            ))}
          </ul>
        ) : error ? (
          <div className="pane-body">{error}</div>
        ) : !messages.length ? (
          searchQuery ? (
            <EmptyState icon={SearchX} title="No messages found">
              Try different words or search another folder.
            </EmptyState>
          ) : (
            <EmptyState icon={Inbox} title={`${title} is empty`} />
          )
        ) : (
          <ul className="message-rows">
            {messages.map((message) => {
              const person = isOutgoing ? message.to[0] : message.from;
              const name = isOutgoing
                ? `To: ${message.to.map(displayName).join(', ') || '(no recipients)'}`
                : displayName(message.from);
              return (
                <li
                  key={message.uid}
                  className={[
                    'message-row',
                    message.unread && 'is-unread',
                    message.uid === activeUid && 'is-active',
                    selected.has(message.uid) && 'is-selected',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={selected.has(message.uid)}
                    onChange={() => onSelect(message.uid)}
                    aria-label={`Select message: ${message.subject || '(no subject)'}`}
                  />
                  <button
                    type="button"
                    className="message-row__main"
                    onClick={() => onOpen(message)}
                    aria-current={
                      message.uid === activeUid ? 'true' : undefined
                    }
                  >
                    <span className="avatar avatar--sm" aria-hidden="true">
                      {initials(person?.name || person?.address || '?')}
                    </span>
                    <span className="message-row__content">
                      <span className="message-row__top">
                        <span className="message-row__sender">{name}</span>
                        {message.hasAttachments && (
                          <Paperclip
                            size={13}
                            aria-label="Has attachments"
                            className="message-row__icon"
                          />
                        )}
                        <time
                          className="message-row__date"
                          dateTime={message.date}
                        >
                          {formatListDate(message.date)}
                        </time>
                      </span>
                      <span className="message-row__subject">
                        {message.unread && (
                          <span className="unread-dot" aria-label="Unread" />
                        )}
                        {message.subject || '(no subject)'}
                      </span>
                      {message.preview && (
                        <span className="message-row__preview">
                          {message.preview}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`star-button ${message.starred ? 'is-starred' : ''}`}
                    aria-pressed={message.starred}
                    aria-label={message.starred ? 'Unstar' : 'Star'}
                    onClick={() => actions.star([message], !message.starred)}
                  >
                    <Star size={16} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
