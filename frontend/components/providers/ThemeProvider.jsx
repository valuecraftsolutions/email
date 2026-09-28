'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

const STORAGE_KEY = 'vcm-theme';
const ThemeContext = createContext(null);

const systemPrefersDark = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches;

function applyTheme(preference) {
  const dark =
    preference === 'dark' || (preference === 'system' && systemPrefersDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.themePreference = preference;
}

/**
 * Light / Dark / System theme. The preference is kept in localStorage so it
 * applies before sign-in and without a flash (see the inline script in the
 * root layout). Phase 4 syncs it to user_preferences on the server.
 */
export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState('system');

  useEffect(() => {
    let stored = 'system';
    try {
      stored = localStorage.getItem(STORAGE_KEY) || 'system';
    } catch {}
    setPreferenceState(
      ['light', 'dark', 'system'].includes(stored) ? stored : 'system',
    );
  }, []);

  useEffect(() => {
    applyTheme(preference);
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((value) => {
    setPreferenceState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {}
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
