'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Badge } from '@/components/ui/Feedback';
import { ADMIN_NAV } from '@/lib/permissions';

/**
 * Phase 1 dashboard: no statistics are shown until real application data
 * endpoints exist (Phase 5). Sections the user can access are listed honestly.
 */
export default function AdminDashboard() {
  const { user, canAny } = useAuth();
  const sections = ADMIN_NAV.filter(
    (item) => item.href !== '/admin' && canAny(...item.anyOf),
  );

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Administration</h1>
        <p className="page-header__subtitle">
          Welcome, {user.displayName || user.fullName}. Manage ValueCraft Mail
          users, access and configuration.
        </p>
      </header>
      <ul className="section-grid">
        {sections.map((section) => (
          <li key={section.href} className="section-tile">
            <div>
              <h2 className="section-tile__title">{section.label}</h2>
              {section.ready ? (
                <Badge tone="success">Available</Badge>
              ) : (
                <Badge tone="neutral">Planned</Badge>
              )}
            </div>
            {section.ready && (
              <Link href={section.href} className="section-tile__link">
                Open <ArrowRight size={15} aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
