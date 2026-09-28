'use client';

import Link from 'next/link';
import { Inbox, PlugZap, TriangleAlert } from 'lucide-react';
import { useMailbox } from '@/components/providers/MailboxProvider';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import MailWorkspace from './MailWorkspace';

function Shell({ children }) {
  return (
    <div className="mail-workspace">
      <section className="mail-list" aria-labelledby="mail-list-title">
        <header className="pane-header">
          <h1 id="mail-list-title" className="pane-header__title">
            <Inbox size={18} aria-hidden="true" /> Inbox
          </h1>
        </header>
        {children}
      </section>
      <section className="mail-preview" aria-hidden="true" />
    </div>
  );
}

/**
 * Mail home: the workspace once the mailbox is connected, otherwise the real
 * connection state (connect, reconnect, server unavailable).
 */
export default function MailHome() {
  const {
    loading,
    error,
    mailbox,
    connected,
    needsReconnect,
    foldersError,
    refresh,
  } = useMailbox();
  const retry = (
    <Button variant="secondary" onClick={refresh}>
      Retry
    </Button>
  );

  if (loading)
    return (
      <Shell>
        <div className="stack-sm pane-body">
          <Skeleton height={16} width="60%" />
          <Skeleton height={16} width="80%" />
          <Skeleton height={16} width="70%" />
        </div>
      </Shell>
    );

  if (error)
    return (
      <Shell>
        <div className="pane-body">
          <Alert
            tone="error"
            title="Could not load your mailbox"
            action={retry}
          >
            {error.message}
          </Alert>
        </div>
      </Shell>
    );

  if (needsReconnect)
    return (
      <Shell>
        <EmptyState
          icon={TriangleAlert}
          title="Reconnect your mailbox"
          action={
            <Link href="/settings/mailbox" className="btn btn--primary btn--md">
              Reconnect
            </Link>
          }
        >
          The mail server no longer accepts the saved password for{' '}
          {mailbox?.emailAddress}.
        </EmptyState>
      </Shell>
    );

  if (foldersError)
    return (
      <Shell>
        <div className="pane-body">
          <Alert tone="warning" title="Mail server unavailable" action={retry}>
            {foldersError.message}
          </Alert>
        </div>
      </Shell>
    );

  if (!connected)
    return (
      <Shell>
        <EmptyState
          icon={PlugZap}
          title="Connect your mailbox"
          action={
            <Link href="/settings/mailbox" className="btn btn--primary btn--md">
              Connect mailbox
            </Link>
          }
        >
          Link your ValueCraft Minds mailbox to start reading and sending mail
          here.
        </EmptyState>
      </Shell>
    );

  return <MailWorkspace />;
}
