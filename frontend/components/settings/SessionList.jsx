'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Laptop, LogOut, MonitorSmartphone } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { authService } from '@/services/authService';
import {
  describeUserAgent,
  formatDateTime,
  formatRelative,
} from '@/utils/format';

const STATUS = {
  ACTIVE: { tone: 'success', label: 'Active' },
  EXPIRED: { tone: 'neutral', label: 'Expired' },
  SIGNED_OUT: { tone: 'neutral', label: 'Signed out' },
  REVOKED: { tone: 'warning', label: 'Revoked' },
};

export default function SessionList() {
  const notify = useToast();
  const router = useRouter();
  const { clearSession } = useAuth();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);
  const [confirmOthers, setConfirmOthers] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSessions((await authService.listSessions()).sessions);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(session) {
    setPending(session.id);
    try {
      const result = await authService.revokeSession(session.id);
      if (result.signedOut) {
        clearSession();
        router.replace('/login');
        return;
      }
      notify('Session signed out.', { tone: 'success' });
      await load();
    } catch (err) {
      notify(err.message, { tone: 'error' });
    } finally {
      setPending(null);
    }
  }

  async function revokeOthers() {
    setPending('others');
    try {
      const { revokedSessions } = await authService.revokeOtherSessions();
      notify(`${revokedSessions} session(s) signed out.`, { tone: 'success' });
      setConfirmOthers(false);
      await load();
    } catch (err) {
      notify(err.message, { tone: 'error' });
    } finally {
      setPending(null);
    }
  }

  if (error)
    return (
      <Alert
        tone="error"
        title="Could not load sessions"
        action={
          <Button variant="secondary" onClick={load}>
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    );

  if (!sessions)
    return (
      <div className="panel" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="session-row">
            <Skeleton width={36} height={36} />
            <div className="stack-sm grow">
              <Skeleton width="40%" />
              <Skeleton width="65%" height={12} />
            </div>
          </div>
        ))}
      </div>
    );

  const otherActive = sessions.filter(
    (s) => s.status === 'ACTIVE' && !s.current,
  ).length;

  return (
    <>
      <div className="toolbar">
        <Button
          variant="danger-outline"
          icon={LogOut}
          disabled={!otherActive}
          onClick={() => setConfirmOthers(true)}
        >
          Sign out other sessions
        </Button>
      </div>
      {!sessions.length ? (
        <EmptyState icon={MonitorSmartphone} title="No sessions">
          No recent sessions were found.
        </EmptyState>
      ) : (
        <ul className="panel session-list">
          {sessions.map((session) => {
            const status = STATUS[session.status] ?? STATUS.EXPIRED;
            return (
              <li key={session.id} className="session-row">
                <span className="session-row__icon" aria-hidden="true">
                  <Laptop size={18} />
                </span>
                <div className="session-row__body">
                  <p className="session-row__title">
                    {describeUserAgent(session.userAgent)}
                    {session.current && <Badge tone="info">This device</Badge>}
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </p>
                  <p className="session-row__meta">
                    {session.ipAddress ?? 'Unknown IP'} · Signed in{' '}
                    {formatDateTime(session.createdAt)} · Last active{' '}
                    {formatRelative(session.lastSeenAt)}
                  </p>
                </div>
                {session.status === 'ACTIVE' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={pending === session.id}
                    onClick={() => revoke(session)}
                  >
                    {session.current ? 'Sign out' : 'Revoke'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={confirmOthers}
        title="Sign out other sessions?"
        confirmLabel="Sign out others"
        loading={pending === 'others'}
        onConfirm={revokeOthers}
        onCancel={() => setConfirmOthers(false)}
      >
        {otherActive} other active session(s) will be signed out immediately.
        This device stays signed in.
      </ConfirmDialog>
    </>
  );
}
