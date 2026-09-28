'use client';

import CompanySignatureEditor from '@/components/admin/CompanySignatureEditor';
import RequireAuth from '@/components/layout/RequireAuth';

export default function AdminSignaturesPage() {
  return (
    <RequireAuth anyOf={['signatures.manage_company']}>
      <header className="page-header">
        <h1 className="page-header__title">Email Signatures</h1>
        <p className="page-header__subtitle">
          The company signature template. Placeholders are filled in with each
          employee&apos;s details when they write mail.
        </p>
      </header>
      <CompanySignatureEditor />
    </RequireAuth>
  );
}
