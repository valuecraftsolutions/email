'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  KeyRound,
  Mail,
  MonitorSmartphone,
  PenLine,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';

const ITEMS = [
  { href: '/settings/profile', label: 'Profile', Icon: UserRound },
  { href: '/settings/mailbox', label: 'Mailbox', Icon: Mail },
  {
    href: '/settings/signature',
    label: 'Signature',
    Icon: PenLine,
    permission: 'signatures.read',
  },
  {
    href: '/settings/preferences',
    label: 'Preferences',
    Icon: SlidersHorizontal,
  },
  { href: '/settings/security', label: 'Security', Icon: KeyRound },
  { href: '/settings/sessions', label: 'Sessions', Icon: MonitorSmartphone },
];

export default function SettingsNav() {
  const pathname = usePathname();
  const { can } = useAuth();
  return (
    <nav className="sidebar__nav">
      <Link href="/" className="nav-item nav-item--back">
        <ArrowLeft size={17} aria-hidden="true" />
        <span>Back to mail</span>
      </Link>
      <p className="sidebar__heading">Settings</p>
      <ul className="nav-list">
        {ITEMS.filter((item) => !item.permission || can(item.permission)).map(
          ({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="nav-item"
                aria-current={pathname === href ? 'page' : undefined}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
