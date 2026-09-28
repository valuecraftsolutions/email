'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { mailService } from '@/services/mailService';
import { mailboxService } from '@/services/mailboxService';

const MailboxContext = createContext(null);

/**
 * Loads the signed-in user's mailbox connection and, when connected, its
 * folders. Shared by the sidebar, the inbox and Settings → Mailbox.
 */
export function MailboxProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    mailbox: null,
    folders: [],
    foldersError: null,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      const { mailboxes } = await mailboxService.listMine();
      const mailbox =
        mailboxes.find((m) => m.isPrimary) ?? mailboxes[0] ?? null;
      let folders = [];
      let foldersError = null;
      if (mailbox?.hasCredentials) {
        try {
          folders = (await mailService.listFolders()).folders;
        } catch (err) {
          foldersError = err;
        }
      }
      setState({ loading: false, mailbox, folders, foldersError, error: null });
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      connected: Boolean(state.mailbox?.hasCredentials) && !state.foldersError,
      // Only a rejected password needs user action; outages are shown as retryable.
      needsReconnect:
        state.foldersError?.code === 'MAILBOX_CREDENTIALS_INVALID',
      refresh,
    }),
    [state, refresh],
  );

  return (
    <MailboxContext.Provider value={value}>{children}</MailboxContext.Provider>
  );
}

export function useMailbox() {
  const context = useContext(MailboxContext);
  if (!context)
    throw new Error('useMailbox must be used inside <MailboxProvider>');
  return context;
}
