'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { useTheme } from '@/components/providers/ThemeProvider';

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

export default function ThemeToggle() {
  const { preference } = useTheme();
  // Saves to the server when signed in; otherwise only this browser remembers it.
  const { update } = usePreferences();
  const setPreference = (theme) => update({ theme }).catch(() => {});
  return (
    <div className="segmented" role="radiogroup" aria-label="Theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          className="segmented__option"
          onClick={() => setPreference(value)}
          title={label}
        >
          <Icon size={15} aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
