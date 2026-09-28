import SessionList from '@/components/settings/SessionList';

export const metadata = { title: 'Sessions' };

export default function SessionsPage() {
  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Sessions</h1>
        <p className="page-header__subtitle">
          Devices signed in to your account during the last 30 days. Sign out
          any session you do not recognise.
        </p>
      </header>
      <SessionList />
    </>
  );
}
