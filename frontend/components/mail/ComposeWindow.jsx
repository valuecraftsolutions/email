'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Minus,
  Paperclip,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useMailbox } from '@/components/providers/MailboxProvider';
import { useToast } from '@/components/providers/ToastProvider';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { mailService } from '@/services/mailService';
import { formatBytes, isEmail } from '@/utils/mail';
import { notifyMailChanged } from './ComposeProvider';
import RecipientInput from './RecipientInput';
import RichTextEditor from './RichTextEditor';

// Mirrors the server default (MAIL_MAX_ATTACHMENT_MB); the API enforces the real limit.
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

const refsOf = (list) =>
  list.map(({ folder, uid, partId }) => ({ folder, uid, partId }));

export default function ComposeWindow({ initial, onClose }) {
  const { mailbox } = useMailbox();
  const notify = useToast();
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const requestId = useRef(crypto.randomUUID());
  const busyRef = useRef(false);

  const [to, setTo] = useState(initial.to ?? []);
  const [cc, setCc] = useState(initial.cc ?? []);
  const [bcc, setBcc] = useState(initial.bcc ?? []);
  const [showCc, setShowCc] = useState(Boolean(initial.cc?.length));
  const [showBcc, setShowBcc] = useState(Boolean(initial.bcc?.length));
  const [subject, setSubject] = useState(initial.subject ?? '');
  const [files, setFiles] = useState([]);
  const [included, setIncluded] = useState(initial.includeAttachments ?? []);
  const [draftUid, setDraftUid] = useState(initial.draftUid ?? null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [dirty, setDirty] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const touch = () => setDirty(true);
  const totalBytes =
    files.reduce((sum, f) => sum + f.size, 0) +
    included.reduce((sum, a) => sum + (a.size ?? 0), 0);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const content = () => ({
    to,
    cc: showCc ? cc : [],
    bcc: showBcc ? bcc : [],
    subject,
    html: editorRef.current?.getHtml() ?? '',
    text: editorRef.current?.getText() ?? '',
    inReplyTo: initial.inReplyTo,
    references: initial.references ?? [],
    includeAttachments: refsOf(included),
  });

  async function guarded(kind, action) {
    if (busyRef.current) return; // prevents double submission
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message);
      if (err.details?.length) setFieldErrors(err.fieldErrors?.() ?? {});
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  function validateForSend() {
    const errors = {};
    const all = [...to, ...(showCc ? cc : []), ...(showBcc ? bcc : [])];
    if (!to.length) errors.to = 'Add at least one recipient.';
    const invalid = all.filter((a) => !isEmail(a));
    if (invalid.length) errors.to = `Invalid address: ${invalid.join(', ')}`;
    if (totalBytes > MAX_TOTAL_BYTES)
      errors.attachments = `Attachments exceed ${formatBytes(MAX_TOTAL_BYTES)}.`;
    setFieldErrors(errors);
    return !Object.keys(errors).length;
  }

  const send = () =>
    guarded('send', async () => {
      if (!validateForSend()) return;
      const result = await mailService.send(
        {
          ...content(),
          replyTo: initial.replyTo,
          draftUid: draftUid ?? undefined,
          clientRequestId: requestId.current,
        },
        files,
      );
      notify(
        result.savedToSent
          ? 'Message sent.'
          : 'Message sent (no copy saved to Sent).',
        { tone: 'success' },
      );
      notifyMailChanged();
      onClose();
    });

  const saveDraft = () =>
    guarded('save', async () => {
      const saved = await mailService.saveDraft(
        { ...content(), replaceUid: draftUid ?? undefined },
        files,
      );
      // The previous draft is replaced; re-point attachments at the new copy.
      if (saved.uid) {
        const { message } = await mailService.getMessage({
          folder: saved.folder,
          uid: saved.uid,
        });
        setIncluded(
          message.attachments
            .filter((a) => !a.embedded)
            .map((a) => ({
              folder: saved.folder,
              uid: saved.uid,
              partId: a.partId,
              filename: a.filename,
              size: a.size,
            })),
        );
        setFiles([]);
      }
      setDraftUid(saved.uid ?? null);
      setDirty(false);
      notify('Draft saved.', { tone: 'success' });
      notifyMailChanged();
    });

  const discard = () =>
    guarded('discard', async () => {
      if (draftUid) await mailService.remove('drafts', [draftUid], true);
      setConfirmDiscard(false);
      if (draftUid) notifyMailChanged();
      onClose();
    });

  const requestClose = () => {
    if (dirty || draftUid) setConfirmDiscard(true);
    else onClose();
  };

  const addFiles = (list) => {
    const incoming = [...list];
    if (!incoming.length) return;
    setFiles((current) => [...current, ...incoming]);
    setFieldErrors((e) => ({ ...e, attachments: undefined }));
    touch();
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  };

  const title = subject.trim() || 'New message';

  return (
    <>
      <section
        className={`compose ${minimized ? 'compose--minimized' : ''}`}
        role="dialog"
        aria-label={title}
        onKeyDown={onKeyDown}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        <header className="compose__header">
          <h2 className="compose__title">{title}</h2>
          <button
            type="button"
            className="icon-button icon-button--sm"
            onClick={() => setMinimized((v) => !v)}
            aria-label={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? (
              <Maximize2 size={15} aria-hidden="true" />
            ) : (
              <Minus size={15} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="icon-button icon-button--sm"
            onClick={requestClose}
            aria-label="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        {!minimized && (
          <>
            <div className="compose__fields">
              <div className="compose__from">
                <span className="recipient-field__label">From</span>
                <span>{mailbox?.emailAddress}</span>
              </div>
              <div className="compose__row">
                <RecipientInput
                  label="To"
                  value={to}
                  onChange={(v) => {
                    setTo(v);
                    touch();
                  }}
                  error={fieldErrors.to}
                  autoFocus={!to.length}
                />
                <div className="compose__toggles">
                  {!showCc && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setShowCc(true)}
                    >
                      Cc
                    </button>
                  )}
                  {!showBcc && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setShowBcc(true)}
                    >
                      Bcc
                    </button>
                  )}
                </div>
              </div>
              {showCc && (
                <RecipientInput
                  label="Cc"
                  value={cc}
                  onChange={(v) => {
                    setCc(v);
                    touch();
                  }}
                />
              )}
              {showBcc && (
                <RecipientInput
                  label="Bcc"
                  value={bcc}
                  onChange={(v) => {
                    setBcc(v);
                    touch();
                  }}
                />
              )}
              <input
                className="compose__subject"
                placeholder="Subject"
                aria-label="Subject"
                value={subject}
                maxLength={998}
                onChange={(e) => {
                  setSubject(e.target.value);
                  touch();
                }}
              />
            </div>

            <RichTextEditor
              ref={editorRef}
              initialHtml={initial.html ?? ''}
              onChange={touch}
            />

            {(files.length > 0 || included.length > 0) && (
              <ul className="compose__attachments" aria-label="Attachments">
                {included.map((a) => (
                  <li key={`${a.uid}-${a.partId}`} className="attachment-chip">
                    <Paperclip size={14} aria-hidden="true" />
                    <span className="attachment-chip__name">{a.filename}</span>
                    <span className="attachment-chip__size">
                      {formatBytes(a.size)}
                    </span>
                    <button
                      type="button"
                      className="chip__remove"
                      aria-label={`Remove ${a.filename}`}
                      onClick={() => {
                        setIncluded((list) => list.filter((x) => x !== a));
                        touch();
                      }}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="attachment-chip">
                    <Paperclip size={14} aria-hidden="true" />
                    <span className="attachment-chip__name">{file.name}</span>
                    <span className="attachment-chip__size">
                      {formatBytes(file.size)}
                    </span>
                    <button
                      type="button"
                      className="chip__remove"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => {
                        setFiles((list) => list.filter((_, i) => i !== index));
                        touch();
                      }}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {(error || fieldErrors.attachments) && (
              <div className="compose__alert">
                <Alert tone="error">{fieldErrors.attachments ?? error}</Alert>
              </div>
            )}

            <footer className="compose__footer">
              <Button
                icon={Send}
                loading={busy === 'send'}
                disabled={Boolean(busy)}
                onClick={send}
                title="Send (Ctrl+Enter)"
              >
                Send
              </Button>
              <Button
                variant="secondary"
                icon={Save}
                loading={busy === 'save'}
                disabled={Boolean(busy)}
                onClick={saveDraft}
              >
                Save draft
              </Button>
              <button
                type="button"
                className="icon-button"
                aria-label="Attach files"
                title="Attach files"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={18} aria-hidden="true" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <span className="compose__spacer" />
              <button
                type="button"
                className="icon-button"
                aria-label="Discard"
                title="Discard"
                onClick={() => setConfirmDiscard(true)}
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </footer>
          </>
        )}
      </section>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this message?"
        confirmLabel="Discard"
        loading={busy === 'discard'}
        onConfirm={discard}
        onCancel={() => setConfirmDiscard(false)}
      >
        {draftUid
          ? 'The saved draft will also be deleted.'
          : 'Your changes will be lost.'}
      </ConfirmDialog>
    </>
  );
}
