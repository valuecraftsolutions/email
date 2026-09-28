import SignatureSettings from '@/components/settings/SignatureSettings';

export const metadata = { title: 'Signature' };

export default function SignaturePage() {
  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Signature</h1>
        <p className="page-header__subtitle">
          Choose the signature added to messages you write.
        </p>
      </header>
      <SignatureSettings />
    </>
  );
}
