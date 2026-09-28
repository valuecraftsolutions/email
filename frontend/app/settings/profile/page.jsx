import ProfileSettings from '@/components/settings/ProfileSettings';

export const metadata = { title: 'Profile' };

export default function ProfilePage() {
  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Profile</h1>
        <p className="page-header__subtitle">
          Your account details and how colleagues see you.
        </p>
      </header>
      <ProfileSettings />
    </>
  );
}
