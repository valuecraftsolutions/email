'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertOctagon,
  ArrowLeft,
  Download,
  Forward,
  ImageOff,
  Mail,
  Paperclip,
  PenSquare,
  Printer,
  Reply,
  ReplyAll,
  Star,
  Trash2,
  Undo2,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { contactService } from '@/services/productivityService';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { mailService } from '@/services/mailService';
import { initials } from '@/utils/format';
import {
  addressList,
  buildDraftEdit,
  buildForward,
  buildReply,
  displayName,
  formatBytes,
  formatLongDate,
} from '@/utils/mail';
import { useCompose } from './ComposeProvider';
import MessageBody from './MessageBody';
import MoveMenu from './MoveMenu';

export default function MessageReader({
  folder,
  uid,
  role,
  folders,
  actions,
  onClose,
  onLoaded,
}) {
  const { user, can } = useAuth();
  const notify = useToast();

  const addSenderToContacts = async () => {
    const from = state.message?.from;
    if (!from) return;
    try {
      await contactService.create({
        displayName: from.name || null,
        email: from.address,
      });
      notify(`${from.name || from.address} added to contacts.`, {
        tone: 'success',
      });
    } catch (error) {
      notify(
        error.code === 'CONTACT_EXISTS'
          ? 'This sender is already in your contacts.'
          : error.message,
        { tone: error.code === 'CONTACT_EXISTS' ? 'info' : 'error' },
      );
    }
  };
  const { openCompose } = useCompose();
  const bodyRef = useRef(null);
  const [state, setState] = useState({
    loading: true,
    message: null,
    error: null,
  });
  const [showImages, setShowImages] = useState(false);

  useEffect(() => {
    setShowImages(false);
  }, [folder, uid]);

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    mailService
      .getMessage(
        { folder, uid, markRead: true, images: showImages || undefined },
        { signal: controller.signal },
      )
      .then(({ message }) => {
        setState({ loading: false, message, error: null });
        onLoaded?.(message);
      })
      .catch((error) => {
        if (error.name !== 'AbortError')
          setState({ loading: false, message: null, error });
      });
    return () => controller.abort();
    // onLoaded is intentionally not a dependency: it must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, uid, showImages]);

  const { loading, message, error } = state;

  if (loading && !message)
    return (
      <section className="mail-preview mail-preview--reading" aria-busy="true">
        <div className="reader">
          <Skeleton width="60%" height={22} />
          <div className="stack-sm reader__skeleton">
            <Skeleton width="40%" />
            <Skeleton width="30%" height={12} />
            <Skeleton height={160} />
          </div>
        </div>
      </section>
    );

  if (error)
    return (
      <section className="mail-preview mail-preview--reading">
        <div className="reader">
          <button
            type="button"
            className="toolbar-button reader__back"
            onClick={onClose}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </button>
          <Alert tone="error" title="Could not open this message">
            {error.message}
          </Alert>
        </div>
      </section>
    );

  if (!message)
    return (
      <section className="mail-preview">
        <EmptyState title="No message selected">
          Select a message to read it here.
        </EmptyState>
      </section>
    );

  const selfEmail = user.email;
  const attachments = message.attachments.filter((a) => !a.embedded);
  const isDraft = role === 'drafts';
  const act = (fn) => () => fn([message]);

  return (
    <section
      className="mail-preview mail-preview--reading"
      aria-label="Message"
    >
      <div className="reader">
        <div
          className="reader__toolbar"
          role="toolbar"
          aria-label="Message actions"
        >
          <button
            type="button"
            className="icon-button reader__back"
            onClick={onClose}
            aria-label="Back to list"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          {isDraft ? (
            <Button
              size="sm"
              icon={PenSquare}
              onClick={() => openCompose(buildDraftEdit(message))}
            >
              Edit draft
            </Button>
          ) : (
            <>
              <button
                type="button"
                className="toolbar-button"
                onClick={() =>
                  openCompose(buildReply(message, { self: selfEmail }))
                }
              >
                <Reply size={16} aria-hidden="true" /> <span>Reply</span>
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={() =>
                  openCompose(
                    buildReply(message, { all: true, self: selfEmail }),
                  )
                }
              >
                <ReplyAll size={16} aria-hidden="true" /> <span>Reply all</span>
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={() => openCompose(buildForward(message))}
              >
                <Forward size={16} aria-hidden="true" /> <span>Forward</span>
              </button>
            </>
          )}
          <span className="list-toolbar__spacer" />
          <button
            type="button"
            className={`icon-button star-button ${message.starred ? 'is-starred' : ''}`}
            aria-pressed={message.starred}
            aria-label={message.starred ? 'Unstar' : 'Star'}
            title={message.starred ? 'Unstar' : 'Star'}
            onClick={async () => {
              await actions.star([message], !message.starred);
              setState((s) => ({
                ...s,
                message: { ...s.message, starred: !s.message.starred },
              }));
            }}
          >
            <Star size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Mark as unread"
            aria-label="Mark as unread"
            onClick={async () => {
              await actions.markRead([message], false);
              onClose();
            }}
          >
            <Mail size={17} aria-hidden="true" />
          </button>
          <MoveMenu
            compact
            folders={folders}
            currentPath={message.folder}
            onMove={(target) => actions.move([message], target)}
          />
          {role === 'spam' ? (
            <button
              type="button"
              className="icon-button"
              title="Not spam"
              aria-label="Not spam"
              onClick={act(actions.notSpam)}
            >
              <Undo2 size={17} aria-hidden="true" />
            </button>
          ) : (
            actions.canSpam &&
            !isDraft && (
              <button
                type="button"
                className="icon-button"
                title="Report spam"
                aria-label="Report spam"
                onClick={act(actions.spam)}
              >
                <AlertOctagon size={17} aria-hidden="true" />
              </button>
            )
          )}
          {role === 'trash' && (
            <button
              type="button"
              className="icon-button"
              title="Restore to Inbox"
              aria-label="Restore to Inbox"
              onClick={act(actions.restore)}
            >
              <Undo2 size={17} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            title="Delete"
            aria-label="Delete"
            onClick={act(actions.remove)}
          >
            <Trash2 size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Print"
            aria-label="Print"
            onClick={() => bodyRef.current?.print()}
          >
            <Printer size={17} aria-hidden="true" />
          </button>
        </div>

        <h2 className="reader__subject">{message.subject || '(no subject)'}</h2>

        <div className="reader__meta">
          <span className="avatar" aria-hidden="true">
            {initials(message.from?.name || message.from?.address || '?')}
          </span>
          <div className="reader__people">
            <p className="reader__from">
              <strong>{displayName(message.from)}</strong>
              {message.from?.name && (
                <span className="reader__address">
                  &lt;{message.from.address}&gt;
                </span>
              )}
              {can('contacts.create') &&
                message.from?.address &&
                message.from.address !== selfEmail && (
                  <button
                    type="button"
                    className="link-button reader__add-contact"
                    onClick={addSenderToContacts}
                  >
                    <UserPlus size={14} aria-hidden="true" /> Add to contacts
                  </button>
                )}
            </p>
            <p className="reader__recipients">
              To: {addressList(message.to) || '—'}
              {message.cc.length > 0 && <> · Cc: {addressList(message.cc)}</>}
            </p>
          </div>
          <time
            className="reader__date"
            dateTime={message.date}
            title={formatLongDate(message.date)}
          >
            {formatLongDate(message.date)}
          </time>
        </div>

        {message.blockedImages > 0 && !showImages && (
          <div className="reader__notice">
            <ImageOff size={16} aria-hidden="true" />
            <span>
              {message.blockedImages} remote image
              {message.blockedImages === 1 ? '' : 's'} blocked to protect your
              privacy.
            </span>
            <button
              type="button"
              className="link-button"
              onClick={() => setShowImages(true)}
            >
              Show images
            </button>
          </div>
        )}

        {attachments.length > 0 && (
          <ul className="reader__attachments" aria-label="Attachments">
            {attachments.map((a) => (
              <li key={a.partId}>
                <a
                  className="attachment-chip attachment-chip--link"
                  href={mailService.attachmentUrl(
                    message.folder,
                    message.uid,
                    a.partId,
                  )}
                  download={a.filename}
                  title={`Download ${a.filename}`}
                >
                  <Paperclip size={14} aria-hidden="true" />
                  <span className="attachment-chip__name">{a.filename}</span>
                  <span className="attachment-chip__size">
                    {formatBytes(a.size)}
                  </span>
                  <Download size={14} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="reader__body">
          <MessageBody
            ref={bodyRef}
            message={message}
            allowRemoteImages={showImages}
          />
        </div>
      </div>
    </section>
  );
}
