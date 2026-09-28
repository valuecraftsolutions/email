'use client';

import { useRef, useState } from 'react';
import { PlugZap, RefreshCw, Unplug } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useMailbox } from '@/components/providers/MailboxProvider';
import { useToast } from '@/components/providers/ToastProvider';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Badge, Skeleton } from '@/components/ui/Feedback';
import TextField from '@/components/ui/TextField';
import { mailboxService } from '@/services/mailboxService';
import { formatDateTime } from '@/utils/format';

const STATUS = {
  CONNECTED: { tone: 'success', label: 'Connected' },
  FAILED: { tone: 'warning', label: 'Needs attention' },
  UNKNOWN: { tone: 'neutral', label: 'Not connected' },
};

const ERROR_TEXT = {
  AUTH_FAILED: 'The mail server rejected the saved password.',
  UNAVAILABLE: 'The mail server could not be reached.',
};

export default function MailboxSettings() {
  const { user } = useAuth();
  const { loading, mailbox, refresh } = useMailbox();
  const notify = useToast();
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const inFlight = useRef(false);

  const connected = Boolean(mailbox?.hasCredentials);
  const status = connected
    ? (STATUS[mailbox.connectionStatus] ?? STATUS.UNKNOWN)
    : STATUS.UNKNOWN;

  async function run(kind, action) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    setError(null);
    try {
      await action();
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  const connect = (event) => {
    event.preventDefault();
    if (!password) {
      setFieldError('Enter your mailbox password.');
      return;
    }
    run('connect', async () => {
      try {
        await mailboxService.connect(password);
        setPassword('');
        setShowForm(false);
        notify('Mailbox connected.', { tone: 'success' });
        await refresh();
      } catch (err) {
        setPassword('');
        if (err.code === 'MAILBOX_AUTH_FAILED') setFieldError(err.message);
        else setError(err.message);
      }
    });
  };

  const test = () =>
    run('test', async () => {
      try {
        await mailboxService.test();
        notify('Connection OK: IMAP and SMTP both responded.', {
          tone: 'success',
        });
      } catch (err) {
        notify(err.message, { tone: 'error' });
      }
      await refresh();
    });

  const disconnect = () =>
    run('disconnect', async () => {
      try {
        await mailboxService.disconnect();
        setConfirmDisconnect(false);
        notify('Mailbox disconnected. The saved password was deleted.', {
          tone: 'success',
        });
        await refresh();
      } catch (err) {
        notify(err.message, { tone: 'error' });
      }
    });

  if (loading)
    return (
      <div className="panel stack-sm" aria-busy="true">
        <Skeleton width="40%" height={18} />
        <Skeleton width="70%" />
      </div>
    );

  return (
    <>
      <section className="panel" aria-labelledby="mailbox-heading">
        <div className="panel__header panel__header--row">
          <div>
            <h2 id="mailbox-heading" className="panel__title">
              {mailbox?.emailAddress ?? user.email}
            </h2>
            <p className="panel__subtitle">
              Hostinger Email · IMAP and SMTP over TLS
            </p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>

        {connected && (
          <dl className="detail-list">
            <div>
              <dt>Last successful connection</dt>
              <dd>{formatDateTime(mailbox.lastConnectedAt)}</dd>
            </div>
            <div>
              <dt>Password saved</dt>
              <dd>{formatDateTime(mailbox.credentialsUpdatedAt)}</dd>
            </div>
            {mailbox.lastErrorCode && mailbox.connectionStatus === 'FAILED' && (
              <div>
                <dt>Last problem</dt>
                <dd>
                  {ERROR_TEXT[mailbox.lastErrorCode] ?? mailbox.lastErrorCode} (
                  {formatDateTime(mailbox.lastErrorAt)})
                </dd>
              </div>
            )}
          </dl>
        )}

        {error && <Alert tone="error">{error}</Alert>}

        {!connected || showForm ? (
          <form className="form form--narrow" onSubmit={connect} noValidate>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={user.email}
              hidden
              readOnly
            />
            <TextField
              label="Mailbox password"
              type="password"
              autoComplete="current-password"
              hint="The password of your Hostinger mailbox. It is verified with the mail server, then stored encrypted and never shown again."
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldError(null);
              }}
              error={fieldError}
            />
            <div className="button-row">
              <Button type="submit" icon={PlugZap} loading={busy === 'connect'}>
                {connected ? 'Update password' : 'Connect mailbox'}
              </Button>
              {showForm && (
                <Button variant="secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        ) : (
          <div className="button-row">
            <Button
              variant="secondary"
              icon={RefreshCw}
              loading={busy === 'test'}
              onClick={test}
            >
              Test connection
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(true)}>
              Update password
            </Button>
            <Button
              variant="danger-outline"
              icon={Unplug}
              onClick={() => setConfirmDisconnect(true)}
            >
              Disconnect
            </Button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect mailbox?"
        confirmLabel="Disconnect"
        loading={busy === 'disconnect'}
        onConfirm={disconnect}
        onCancel={() => setConfirmDisconnect(false)}
      >
        The saved mailbox password will be deleted. Your mail stays on the
        Hostinger server and you can reconnect at any time.
      </ConfirmDialog>
    </>
  );
}
