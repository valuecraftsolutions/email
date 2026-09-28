import ChangePasswordForm from '@/components/settings/ChangePasswordForm';

export const metadata = { title: 'Security' };

export default function SecurityPage() {
  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Security</h1>
        <p className="page-header__subtitle">
          Manage how you sign in to ValueCraft Mail.
        </p>
      </header>
      <section className="panel" aria-labelledby="password-heading">
        <div className="panel__header">
          <h2 id="password-heading" className="panel__title">
            Change password
          </h2>
          <p className="panel__subtitle">
            Changing your password signs you out of every other device.
          </p>
        </div>
        <ChangePasswordForm />
      </section>
      <section className="panel" aria-labelledby="mfa-heading">
        <div className="panel__header">
          <h2 id="mfa-heading" className="panel__title">
            Two-factor authentication
          </h2>
          <p className="panel__subtitle">
            Additional sign-in verification will be offered in a future release.
          </p>
        </div>
      </section>
    </>
  );
}
