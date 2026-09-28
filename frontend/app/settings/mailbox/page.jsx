import MailboxSettings from '@/components/settings/MailboxSettings';

export const metadata = { title: 'Mailbox' };

export default function MailboxPage() {
  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Mailbox</h1>
        <p className="page-header__subtitle">
          Connect your ValueCraft Minds mailbox. Your mail stays on the
          Hostinger mail server.
        </p>
      </header>
      <MailboxSettings />
    </>
  );
}
