'use client';

import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { notifySignatureChanged } from '@/components/mail/ComposeProvider';
import { useToast } from '@/components/providers/ToastProvider';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Feedback';
import HtmlFrame from '@/components/ui/HtmlFrame';
import { signatureService } from '@/services/productivityService';
import { formatDateTime } from '@/utils/format';

const HELP = {
  full_name: 'Display name, or full name',
  job_title: 'Job title',
  department: 'Department',
  email: 'Work email',
  phone: 'Phone',
  company_name: 'Company name',
};

/**
 * HTML template editor with live preview (rendered with the admin's own
 * details). The API sanitizes the template and every rendered signature.
 */
export default function CompanySignatureEditor() {
  const notify = useToast();
  const textRef = useRef(null);
  const [template, setTemplate] = useState(null);
  const [html, setHtml] = useState('');
  const [preview, setPreview] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    signatureService
      .company()
      .then((data) => {
        setTemplate(data);
        setHtml(data.html);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (template === null) return;
    const timer = setTimeout(() => {
      signatureService
        .preview(html)
        .then((data) => setPreview(data.html))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [html, template]);

  const insert = (name) => {
    const el = textRef.current;
    const token = `{{${name}}}`;
    const start = el?.selectionStart ?? html.length;
    const end = el?.selectionEnd ?? html.length;
    setHtml(html.slice(0, start) + token + html.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await signatureService.updateCompany(html);
      setTemplate(saved);
      setHtml(saved.html);
      notifySignatureChanged();
      notify('Company signature saved.', { tone: 'success' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (template === null)
    return error ? (
      <Alert tone="error" title="Could not load the signature">
        {error}
      </Alert>
    ) : (
      <div className="panel stack-sm" aria-busy="true">
        <Skeleton height={160} />
      </div>
    );

  return (
    <div className="signature-editor">
      <section className="panel" aria-labelledby="template-heading">
        <div className="panel__header">
          <h2 id="template-heading" className="panel__title">
            Template (HTML)
          </h2>
          <p className="panel__subtitle">
            Logos must be HTTPS image URLs. Scripts, forms and external styles
            are removed automatically.
            {template.updatedAt &&
              ` Last saved ${formatDateTime(template.updatedAt)}.`}
          </p>
        </div>
        <div className="placeholder-chips" aria-label="Insert placeholder">
          {template.placeholders.map((p) => (
            <button
              key={p}
              type="button"
              className="chip chip--button"
              title={HELP[p]}
              onClick={() => insert(p)}
            >
              {`{{${p}}}`}
            </button>
          ))}
        </div>
        <label htmlFor="company-template" className="sr-only">
          Signature template HTML
        </label>
        <textarea
          id="company-template"
          ref={textRef}
          className="field__input code-input"
          rows={14}
          spellCheck={false}
          maxLength={20000}
          value={html}
          onChange={(e) => setHtml(e.target.value)}
        />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="button-row">
          <Button
            icon={Save}
            loading={saving}
            disabled={html === template.html}
            onClick={save}
          >
            Save template
          </Button>
        </div>
      </section>
      <section className="panel" aria-labelledby="preview-heading">
        <div className="panel__header">
          <h2 id="preview-heading" className="panel__title">
            Preview
          </h2>
          <p className="panel__subtitle">Shown with your own details.</p>
        </div>
        <HtmlFrame html={preview} title="Signature preview" />
      </section>
    </div>
  );
}
