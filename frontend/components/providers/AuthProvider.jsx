'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { onUnauthorized, setCsrfToken } from '@/lib/api';
import { authService } from '@/services/authService';

const AuthContext = createContext(null);

const SIGNED_OUT = {
  status: 'unauthenticated',
  user: null,
  roles: [],
  permissions: [],
  error: null,
};

export function AuthProvider({ children }) {
  const [state, setState] = useState({ ...SIGNED_OUT, status: 'loading' });

  const applySession = useCallback((data) => {
    setCsrfToken(data.csrfToken);
    setState({
      status: 'authenticated',
      user: data.user,
      roles: data.roles,
      permissions: data.permissions,
      error: null,
    });
  }, []);

  const clearSession = useCallback(() => {
    setCsrfToken(null);
    setState(SIGNED_OUT);
  }, []);

  const refresh = useCallback(async () => {
    try {
      applySession(await authService.me());
    } catch (error) {
      if (error.status === 401) clearSession();
      else setState((s) => ({ ...s, status: 'error', error }));
    }
  }, [applySession, clearSession]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => onUnauthorized(clearSession), [clearSession]);

  const login = useCallback(
    async (email, password) => {
      const data = await authService.login(email, password);
      applySession(data);
      return data;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(() => {
    const granted = new Set(state.permissions);
    return {
      ...state,
      refresh,
      login,
      logout,
      clearSession,
      /** UX-only helpers; the API performs the real authorization. */
      can: (...codes) => codes.every((c) => granted.has(c)),
      canAny: (...codes) => codes.some((c) => granted.has(c)),
    };
  }, [state, refresh, login, logout, clearSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
