'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { preferenceService } from '@/services/productivityService';
import { useAuth } from './AuthProvider';
import { useTheme } from './ThemeProvider';

const DEFAULTS = {
  theme: 'system',
  messagesPerPage: 50,
  density: 'comfortable',
  signatureMode: 'company',
};

const PreferencesContext = createContext({
  preferences: DEFAULTS,
  update: async () => {},
});

/**
 * Loads the signed-in user's preferences from the API and applies them
 * (theme, density). Before sign-in the theme falls back to this browser.
 */
export function PreferencesProvider({ children }) {
  const { status } = useAuth();
  const { setPreference: setTheme } = useTheme();
  const [preferences, setPreferences] = useState(DEFAULTS);

  useEffect(() => {
    if (status !== 'authenticated') {
      setPreferences(DEFAULTS);
      return;
    }
    let cancelled = false;
    preferenceService
      .get()
      .then(({ preferences: loaded }) => {
        if (cancelled) return;
        setPreferences(loaded);
        setTheme(loaded.theme);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, setTheme]);

  useEffect(() => {
    document.documentElement.dataset.density = preferences.density;
  }, [preferences.density]);

  const update = useCallback(
    async (fields) => {
      if (fields.theme) setTheme(fields.theme);
      setPreferences((p) => ({ ...p, ...fields }));
      if (status !== 'authenticated') return;
      const { preferences: saved } = await preferenceService.update(fields);
      setPreferences(saved);
    },
    [status, setTheme],
  );

  const value = useMemo(() => ({ preferences, update }), [preferences, update]);
  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export const usePreferences = () => useContext(PreferencesContext);
