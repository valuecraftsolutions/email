'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { signatureService } from '@/services/productivityService';
import ComposeWindow from './ComposeWindow';

const ComposeContext = createContext(null);

export const MAIL_CHANGED_EVENT = 'vcm:mail-changed';
export const SIGNATURE_CHANGED_EVENT = 'vcm:signature-changed';
export const notifyMailChanged = () =>
  window.dispatchEvent(new Event(MAIL_CHANGED_EVENT));
export const notifySignatureChanged = () =>
  window.dispatchEvent(new Event(SIGNATURE_CHANGED_EVENT));

/** Places the signature above any quoted text, leaving an empty first line for typing. */
export function withSignature(html, signature) {
  if (!signature) return html ?? '';
  const rest = (html ?? '').replace(/^<p><br><\/p>/, '');
  return `<p><br></p><div data-signature="true">${signature}</div>${rest ? `<br>${rest}` : ''}`;
}

/** Hosts a single compose window that any mail screen can open. */
export function ComposeProvider({ children }) {
  const notify = useToast();
  const { can } = useAuth();
  const [session, setSession] = useState(null);
  const signatureRef = useRef('');
  const canReadSignature = can('signatures.read');

  useEffect(() => {
    if (!canReadSignature) return;
    const load = () =>
      signatureService
        .mine()
        .then((data) => {
          signatureRef.current = data.active;
        })
        .catch(() => {});
    load();
    window.addEventListener(SIGNATURE_CHANGED_EVENT, load);
    return () => window.removeEventListener(SIGNATURE_CHANGED_EVENT, load);
  }, [canReadSignature]);

  const openCompose = useCallback(
    (initial = {}) => {
      setSession((current) => {
        if (current) {
          notify('Finish or close the message you are writing first.', {
            tone: 'info',
          });
          return current;
        }
        // An existing draft already contains whatever signature it was written with.
        const html = initial.draftUid
          ? initial.html
          : withSignature(initial.html, signatureRef.current);
        return { key: Date.now(), initial: { ...initial, html } };
      });
    },
    [notify],
  );

  const close = useCallback(() => setSession(null), []);
  const value = useMemo(
    () => ({ openCompose, isOpen: Boolean(session) }),
    [openCompose, session],
  );

  return (
    <ComposeContext.Provider value={value}>
      {children}
      {session && (
        <ComposeWindow
          key={session.key}
          initial={session.initial}
          onClose={close}
        />
      )}
    </ComposeContext.Provider>
  );
}

export function useCompose() {
  const context = useContext(ComposeContext);
  if (!context)
    throw new Error('useCompose must be used inside <ComposeProvider>');
  return context;
}
