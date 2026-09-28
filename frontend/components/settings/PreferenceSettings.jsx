'use client';

import { usePreferences } from '@/components/providers/PreferencesProvider';
import { useToast } from '@/components/providers/ToastProvider';

const GROUPS = [
  {
    key: 'theme',
    title: 'Theme',
    options: [
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
      {
        value: 'system',
        label: 'System',
        hint: 'Follows your device setting.',
      },
    ],
  },
  {
    key: 'messagesPerPage',
    title: 'Messages per page',
    options: [
      { value: 25, label: '25' },
      { value: 50, label: '50' },
      { value: 100, label: '100' },
    ],
  },
  {
    key: 'density',
    title: 'Message list density',
    options: [
      {
        value: 'comfortable',
        label: 'Comfortable',
        hint: 'Shows a preview line.',
      },
      {
        value: 'compact',
        label: 'Compact',
        hint: 'Fits more messages on screen.',
      },
    ],
  },
];

/** Changes save immediately and follow the user to other devices. */
export default function PreferenceSettings() {
  const { preferences, update } = usePreferences();
  const notify = useToast();

  const change = async (key, value) => {
    try {
      await update({ [key]: value });
      notify('Preference saved.', { tone: 'success', duration: 2000 });
    } catch (error) {
      notify(error.message, { tone: 'error' });
    }
  };

  return GROUPS.map((group) => (
    <section
      key={group.key}
      className="panel"
      aria-labelledby={`pref-${group.key}`}
    >
      <div className="panel__header">
        <h2 id={`pref-${group.key}`} className="panel__title">
          {group.title}
        </h2>
      </div>
      <div
        className="choice-list choice-list--row"
        role="radiogroup"
        aria-labelledby={`pref-${group.key}`}
      >
        {group.options.map((option) => (
          <label
            key={option.value}
            className={`choice ${preferences[group.key] === option.value ? 'is-selected' : ''}`}
          >
            <input
              type="radio"
              name={group.key}
              checked={preferences[group.key] === option.value}
              onChange={() => change(group.key, option.value)}
            />
            <span>
              <span className="choice__label">{option.label}</span>
              {option.hint && (
                <span className="choice__hint">{option.hint}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </section>
  ));
}
