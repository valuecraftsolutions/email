'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderInput } from 'lucide-react';

const ROLE_LABELS = {
  inbox: 'Inbox',
  sent: 'Sent',
  drafts: 'Drafts',
  spam: 'Spam',
  trash: 'Trash',
  archive: 'Archive',
};

export const folderDisplayName = (folder) =>
  ROLE_LABELS[folder.role] ?? folder.name;

/** Dropdown listing the folders a message can be moved to. */
export default function MoveMenu({
  folders,
  currentPath,
  onMove,
  disabled,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const targets = folders.filter(
    (f) => f.path !== currentPath && !['drafts', 'sent'].includes(f.role),
  );

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        type="button"
        className={compact ? 'icon-button' : 'toolbar-button'}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || !targets.length}
        title="Move to"
        aria-label="Move to folder"
        onClick={() => setOpen((v) => !v)}
      >
        <FolderInput size={17} aria-hidden="true" />
        {!compact && (
          <>
            <span>Move</span>
            <ChevronDown size={14} aria-hidden="true" />
          </>
        )}
      </button>
      {open && (
        <div className="dropdown__menu" role="menu">
          {targets.map((folder) => (
            <button
              key={folder.path}
              type="button"
              role="menuitem"
              className="dropdown__item"
              onClick={() => {
                setOpen(false);
                onMove(folder);
              }}
            >
              {folderDisplayName(folder)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
