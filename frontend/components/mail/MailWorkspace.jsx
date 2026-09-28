'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMailbox } from '@/components/providers/MailboxProvider';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { useToast } from '@/components/providers/ToastProvider';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/Feedback';
import { mailService } from '@/services/mailService';
import { MAIL_CHANGED_EVENT } from './ComposeProvider';
import MessageList from './MessageList';
import MessageReader from './MessageReader';
import { folderDisplayName } from './MoveMenu';

const POLL_MS = 60_000;
// URL parameters that turn the list into a search (see MailSearch).
export const SEARCH_KEYS = [
  'q',
  'from',
  'to',
  'subject',
  'since',
  'before',
  'unread',
  'hasAttachment',
];

export function describeSearch(criteria) {
  const parts = [];
  if (criteria.q) parts.push(`“${criteria.q}”`);
  if (criteria.from) parts.push(`from ${criteria.from}`);
  if (criteria.to) parts.push(`to ${criteria.to}`);
  if (criteria.subject) parts.push(`subject “${criteria.subject}”`);
  if (criteria.since) parts.push(`after ${criteria.since}`);
  if (criteria.before) parts.push(`before ${criteria.before}`);
  if (criteria.unread) parts.push('unread');
  if (criteria.hasAttachment) parts.push('with attachments');
  return parts.join(', ');
}
const ROLE_ALIASES = [
  'inbox',
  'starred',
  'sent',
  'drafts',
  'spam',
  'trash',
  'archive',
];

/** List + reader for the folder, page, search and message in the URL. */
export default function MailWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const notify = useToast();
  const { folders, refresh: refreshMailbox } = useMailbox();
  const { preferences } = usePreferences();
  const pageSize = preferences.messagesPerPage;

  const folderParam = params.get('folder') || 'inbox';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const openUid = Number(params.get('uid')) || null;
  // Serialized so the load callback only changes when the criteria do.
  const searchKey = JSON.stringify(
    Object.fromEntries(
      SEARCH_KEYS.filter((k) => params.get(k)).map((k) => [k, params.get(k)]),
    ),
  );
  const criteria = useMemo(() => JSON.parse(searchKey), [searchKey]);
  const isSearch = Object.keys(criteria).length > 0;

  const folderInfo = useMemo(() => {
    const lower = folderParam.toLowerCase();
    if (lower === 'starred') return { role: 'starred', title: 'Starred' };
    const match = ROLE_ALIASES.includes(lower)
      ? folders.find((f) => f.role === lower)
      : folders.find((f) => f.path === folderParam);
    if (match)
      return {
        role: match.role,
        title: folderDisplayName(match),
        path: match.path,
      };
    return {
      role: ROLE_ALIASES.includes(lower) ? lower : null,
      title: folderParam,
    };
  }, [folderParam, folders]);

  const [list, setList] = useState({
    loading: true,
    refreshing: false,
    data: null,
    error: null,
  });
  const [selected, setSelected] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null);
  const abortRef = useRef(null);

  const navigate = useCallback(
    (updates) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates))
        if (value === null || value === undefined || value === '')
          next.delete(key);
        else next.set(key, String(value));
      router.push(`/?${next.toString()}`);
    },
    [params, router],
  );

  const load = useCallback(
    async ({ silent = false } = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setList((s) => ({
        ...s,
        loading: !silent,
        refreshing: silent,
        error: silent ? s.error : null,
      }));
      try {
        const searchFolder =
          folderParam.toLowerCase() === 'starred' ? 'inbox' : folderParam;
        const data = isSearch
          ? await mailService.search(
              { ...criteria, folder: searchFolder, page, pageSize },
              { signal: controller.signal },
            )
          : await mailService.listMessages(
              { folder: folderParam, page, pageSize },
              { signal: controller.signal },
            );
        setList({ loading: false, refreshing: false, data, error: null });
      } catch (error) {
        if (error.name === 'AbortError') return;
        setList((s) => ({
          ...s,
          loading: false,
          refreshing: false,
          error: silent ? s.error : error.message,
        }));
      }
    },
    [folderParam, page, pageSize, criteria, isSearch],
  );

  useEffect(() => {
    setSelected(new Set());
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  // Polling instead of fake push: refresh while the tab is visible.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      load({ silent: true });
      refreshMailbox();
    };
    const timer = setInterval(tick, POLL_MS);
    const onChanged = () => {
      load({ silent: true });
      refreshMailbox();
    };
    window.addEventListener(MAIL_CHANGED_EVENT, onChanged);
    return () => {
      clearInterval(timer);
      window.removeEventListener(MAIL_CHANGED_EVENT, onChanged);
    };
  }, [load, refreshMailbox]);

  // ---------------------------------------------------------------- actions

  const listFolder = list.data?.folder;
  const roleFolder = (role) => folders.find((f) => f.role === role);

  const patchMessages = (uids, patch) =>
    setList((s) =>
      s.data
        ? {
            ...s,
            data: {
              ...s.data,
              messages: s.data.messages.map((m) =>
                uids.includes(m.uid) ? { ...m, ...patch } : m,
              ),
            },
          }
        : s,
    );

  const dropMessages = (uids) => {
    setList((s) =>
      s.data
        ? {
            ...s,
            data: {
              ...s.data,
              total: Math.max(0, s.data.total - uids.length),
              messages: s.data.messages.filter((m) => !uids.includes(m.uid)),
            },
          }
        : s,
    );
    setSelected(new Set());
    if (openUid && uids.includes(openUid)) navigate({ uid: null });
  };

  const run = async (work, success) => {
    try {
      await work();
      if (success) notify(success, { tone: 'success' });
      refreshMailbox();
    } catch (error) {
      notify(error.message, { tone: 'error' });
      load({ silent: true });
    }
  };

  const folderOf = (messages) => messages[0]?.folder ?? listFolder;
  const uidsOf = (messages) => messages.map((m) => m.uid);

  const moveTo = (messages, target, label) =>
    run(
      async () => {
        await mailService.move(
          folderOf(messages),
          uidsOf(messages),
          target.path,
        );
        dropMessages(uidsOf(messages));
      },
      label ?? `Moved to ${folderDisplayName(target)}.`,
    );

  const actions = {
    canSpam: Boolean(roleFolder('spam')),
    markRead: (messages, seen) =>
      run(async () => {
        await mailService.setFlags(folderOf(messages), uidsOf(messages), {
          seen,
        });
        patchMessages(uidsOf(messages), { unread: !seen });
      }),
    star: (messages, flagged) =>
      run(async () => {
        await mailService.setFlags(folderOf(messages), uidsOf(messages), {
          flagged,
        });
        if (folderInfo.role === 'starred' && !flagged)
          dropMessages(uidsOf(messages));
        else patchMessages(uidsOf(messages), { starred: flagged });
      }),
    move: (messages, target) => moveTo(messages, target),
    spam: (messages) => {
      const spam = roleFolder('spam');
      if (spam) moveTo(messages, spam, 'Reported as spam.');
    },
    notSpam: (messages) =>
      moveTo(messages, { path: 'INBOX', role: 'inbox' }, 'Moved to Inbox.'),
    restore: (messages) =>
      moveTo(messages, { path: 'INBOX', role: 'inbox' }, 'Restored to Inbox.'),
    remove: (messages) => {
      const permanent =
        folderInfo.role === 'trash' || folderInfo.role === 'drafts';
      const perform = () =>
        run(
          async () => {
            await mailService.remove(
              folderOf(messages),
              uidsOf(messages),
              permanent,
            );
            dropMessages(uidsOf(messages));
          },
          permanent ? 'Deleted permanently.' : 'Moved to Trash.',
        );
      if (permanent)
        setConfirm({
          title: `Delete ${messages.length === 1 ? 'this message' : `${messages.length} messages`} permanently?`,
          body: 'This cannot be undone.',
          onConfirm: perform,
        });
      else perform();
    },
  };

  const onMessageLoaded = useCallback(
    (message) => {
      patchMessages([message.uid], { unread: false });
      refreshMailbox();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshMailbox],
  );

  const toggle = (uid) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  return (
    <div className={`mail-workspace ${openUid ? 'is-reading' : ''}`}>
      <MessageList
        title={folderInfo.title}
        role={folderInfo.role}
        state={list}
        selected={selected}
        activeUid={openUid}
        folders={folders}
        page={page}
        searchQuery={isSearch ? describeSearch(criteria) : ''}
        actions={actions}
        onSelect={toggle}
        onSelectAll={(all) =>
          setSelected(
            all
              ? new Set((list.data?.messages ?? []).map((m) => m.uid))
              : new Set(),
          )
        }
        onOpen={(message) => navigate({ uid: message.uid, rf: message.folder })}
        onRefresh={() => {
          load({ silent: true });
          refreshMailbox();
        }}
        onPage={(next) => navigate({ page: next > 1 ? next : null, uid: null })}
      />
      {openUid ? (
        <MessageReader
          key={`${params.get('rf') || folderParam}:${openUid}`}
          folder={params.get('rf') || folderInfo.path || folderParam}
          uid={openUid}
          role={folderInfo.role}
          folders={folders}
          actions={actions}
          onClose={() => navigate({ uid: null, rf: null })}
          onLoaded={onMessageLoaded}
        />
      ) : (
        <section className="mail-preview" aria-label="Message preview">
          <EmptyState title="No message selected">
            Select a message to read it here.
          </EmptyState>
        </section>
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        confirmLabel="Delete"
        onConfirm={() => {
          confirm?.onConfirm();
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      >
        {confirm?.body}
      </ConfirmDialog>
    </div>
  );
}
