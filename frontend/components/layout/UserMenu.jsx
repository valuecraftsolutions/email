'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Mail, Settings, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ADMIN_AREA_PERMISSIONS } from '@/lib/permissions';
import { initials } from '@/utils/format';
import ThemeToggle from './ThemeToggle';

export default function UserMenu() {
  const { user, roles, canAny, logout } = useAuth();
  const notify = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e) =>
      !rootRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    try {
      await logout();
    } catch {
      notify('You have been signed out on this device.', { tone: 'info' });
    }
    router.replace('/login');
  }

  if (!user) return null;
  const name = user.displayName || user.fullName;

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="avatar-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(name)}
        </span>
        <span className="sr-only">Account menu for {name}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu__header">
            <span className="avatar avatar--lg" aria-hidden="true">
              {initials(name)}
            </span>
            <div className="menu__identity">
              <strong>{name}</strong>
              <span>{user.email}</span>
              <span className="menu__meta">
                {user.userCode} ·{' '}
                {roles
                  .map((r) => r.replace('_', ' ').toLowerCase())
                  .join(', ') || 'no role'}
              </span>
            </div>
          </div>
          <div className="menu__section">
            <span className="menu__label">Theme</span>
            <ThemeToggle />
          </div>
          <Link
            href="/"
            role="menuitem"
            className="menu__item"
            onClick={() => setOpen(false)}
          >
            <Mail size={16} aria-hidden="true" /> Mail
          </Link>
          <Link
            href="/settings/security"
            role="menuitem"
            className="menu__item"
            onClick={() => setOpen(false)}
          >
            <Settings size={16} aria-hidden="true" /> Settings
          </Link>
          {canAny(...ADMIN_AREA_PERMISSIONS) && (
            <Link
              href="/admin"
              role="menuitem"
              className="menu__item"
              onClick={() => setOpen(false)}
            >
              <ShieldCheck size={16} aria-hidden="true" /> Administration
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            className="menu__item menu__item--danger"
            onClick={handleLogout}
          >
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
