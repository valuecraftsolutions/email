'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, Menu, X } from 'lucide-react';
import MailSearch from '@/components/mail/MailSearch';
import Brand from './Brand';
import UserMenu from './UserMenu';

/**
 * Shared chrome for webmail and settings: top bar, collapsible sidebar
 * (drawer on small screens) and a main content region.
 */
export default function AppShell({
  sidebar,
  children,
  brandSuffix,
  brandHref,
}) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setNavOpen(false), [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <div className={`shell ${navOpen ? 'shell--nav-open' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="topbar">
        <button
          type="button"
          className="icon-button topbar__menu"
          onClick={() => setNavOpen((v) => !v)}
          aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={navOpen}
          aria-controls="app-sidebar"
        >
          {navOpen ? (
            <X size={20} aria-hidden="true" />
          ) : (
            <Menu size={20} aria-hidden="true" />
          )}
        </button>
        <Brand href={brandHref} suffix={brandSuffix} />
        <Suspense fallback={<div className="search" />}>
          <MailSearch />
        </Suspense>
        <div className="topbar__actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Notifications (none)"
            disabled
          >
            <Bell size={18} aria-hidden="true" />
          </button>
          <UserMenu />
        </div>
      </header>
      <aside
        id="app-sidebar"
        className="sidebar"
        aria-label="Primary"
        onClick={(e) => {
          // Folder links only change the query string; close the mobile drawer explicitly.
          if (e.target.closest('a, [data-close-nav]')) setNavOpen(false);
        }}
      >
        {sidebar}
      </aside>
      <button
        type="button"
        className="shell__scrim"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => setNavOpen(false)}
      />
      <main id="main" className="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
