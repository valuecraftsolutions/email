'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Contact,
  Inbox,
  LayoutDashboard,
  PenLine,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { ADMIN_NAV } from '@/lib/permissions';

const ICONS = {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Inbox,
  PenLine,
  Contact,
  ScrollText,
  Settings,
};

export default function AdminNav() {
  const pathname = usePathname();
  const { canAny } = useAuth();
  const items = ADMIN_NAV.filter((item) => canAny(...item.anyOf));

  return (
    <nav className="sidebar__nav">
      <Link href="/" className="nav-item nav-item--back">
        <ArrowLeft size={17} aria-hidden="true" />
        <span>Back to mail</span>
      </Link>
      <p className="sidebar__heading">Administration</p>
      <ul className="nav-list">
        {items.map(({ href, label, icon, ready }) => {
          const Icon = ICONS[icon];
          const content = (
            <>
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </>
          );
          return (
            <li key={href}>
              {ready ? (
                <Link
                  href={href}
                  className="nav-item"
                  aria-current={pathname === href ? 'page' : undefined}
                >
                  {content}
                </Link>
              ) : (
                <span
                  className="nav-item nav-item--disabled"
                  aria-disabled="true"
                  title="Planned for a later phase"
                >
                  {content}
                  <span className="nav-item__tag">Soon</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
