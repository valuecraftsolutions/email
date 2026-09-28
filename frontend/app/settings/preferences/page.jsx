import PreferenceSettings from '@/components/settings/PreferenceSettings';

export const metadata = { title: 'Preferences' };

export default function PreferencesPage() {
  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Preferences</h1>
        <p className="page-header__subtitle">
          Appearance and message list options. Saved to your account.
        </p>
      </header>
      <PreferenceSettings />
    </>
  );
}
