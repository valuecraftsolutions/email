'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import RichTextEditor from '@/components/mail/RichTextEditor';
import { notifySignatureChanged } from '@/components/mail/ComposeProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Feedback';
import HtmlFrame from '@/components/ui/HtmlFrame';
import { signatureService } from '@/services/productivityService';

const MODES = [
  {
    value: 'company',
    label: 'Company signature',
    hint: 'The standard ValueCraft Minds signature with your details.',
  },
  {
    value: 'own',
    label: 'My own signature',
    hint: 'A signature you write yourself.',
  },
  {
    value: 'none',
    label: 'No signature',
    hint: 'Nothing is added to new messages.',
  },
];

export default function SignatureSettings() {
  const { can } = useAuth();
  const notify = useToast();
  const canEdit = can('signatures.manage_own');
  const editorRef = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('company');
  const [ownPreview, setOwnPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const load = useCallback(async () => {
    try {
      const loaded = await signatureService.mine();
      setData(loaded);
      setMode(loaded.mode);
      setOwnPreview(loaded.rendered.own);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const preview = async () => {
    try {
      const { html } = await signatureService.preview(
        editorRef.current?.getHtml() ?? '',
      );
      setOwnPreview(html);
    } catch (err) {
      notify(err.message, { tone: 'error' });
    }
  };

  const insertPlaceholder = (name) => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, `{{${name}}}`);
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await signatureService.updateMine({
        mode,
        // The editor is only mounted in "own" mode; the saved own signature is kept otherwise.
        ...(editorRef.current ? { html: editorRef.current.getHtml() } : {}),
      });
      setData(saved);
      setOwnPreview(saved.rendered.own);
      notifySignatureChanged();
      notify('Signature saved.', { tone: 'success' });
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (error)
    return (
      <Alert tone="error" title="Could not load your signature">
        {error}
      </Alert>
    );
  if (!data)
    return (
      <div className="panel stack-sm" aria-busy="true">
        <Skeleton width="40%" height={18} />
        <Skeleton height={80} />
      </div>
    );

  return (
    <>
      <section className="panel" aria-labelledby="sig-mode-heading">
        <div className="panel__header">
          <h2 id="sig-mode-heading" className="panel__title">
            Signature for new messages
          </h2>
          <p className="panel__subtitle">
            Added automatically to new messages, replies and forwards.
          </p>
        </div>
        <div
          className="choice-list"
          role="radiogroup"
          aria-labelledby="sig-mode-heading"
        >
          {MODES.map((m) => (
            <label
              key={m.value}
              className={`choice ${mode === m.value ? 'is-selected' : ''}`}
            >
              <input
                type="radio"
                name="signature-mode"
                value={m.value}
                checked={mode === m.value}
                disabled={!canEdit}
                onChange={() => setMode(m.value)}
              />
              <span>
                <span className="choice__label">{m.label}</span>
                <span className="choice__hint">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {mode === 'company' && (
        <section className="panel" aria-labelledby="sig-company-heading">
          <div className="panel__header">
            <h2 id="sig-company-heading" className="panel__title">
              Company signature preview
            </h2>
            <p className="panel__subtitle">
              Your details come from your profile.
            </p>
          </div>
          {data.rendered.company ? (
            <HtmlFrame
              html={data.rendered.company}
              title="Company signature preview"
            />
          ) : (
            <p className="muted">No company signature has been set up yet.</p>
          )}
        </section>
      )}

      {mode === 'own' && canEdit && (
        <section className="panel" aria-labelledby="sig-own-heading">
          <div className="panel__header">
            <h2 id="sig-own-heading" className="panel__title">
              My signature
            </h2>
            <p className="panel__subtitle">
              Insert placeholders to fill in your details automatically.
            </p>
          </div>
          <div className="placeholder-chips" aria-label="Placeholders">
            {data.placeholders.map((p) => (
              <button
                key={p}
                type="button"
                className="chip chip--button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertPlaceholder(p)}
              >
                {`{{${p}}}`}
              </button>
            ))}
          </div>
          <div className="editor-box">
            <RichTextEditor
              ref={editorRef}
              initialHtml={data.own?.html ?? ''}
              label="My signature"
            />
          </div>
          <div className="button-row">
            <Button variant="secondary" icon={Eye} onClick={preview}>
              Preview
            </Button>
          </div>
          {ownPreview && (
            <HtmlFrame html={ownPreview} title="My signature preview" />
          )}
        </section>
      )}

      {saveError && <Alert tone="error">{saveError}</Alert>}
      {canEdit && (
        <div>
          <Button loading={saving} onClick={save}>
            Save signature
          </Button>
        </div>
      )}
    </>
  );
}
