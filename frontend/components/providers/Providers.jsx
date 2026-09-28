'use client';

import { AuthProvider } from './AuthProvider';
import { PreferencesProvider } from './PreferencesProvider';
import { ThemeProvider } from './ThemeProvider';
import { ToastProvider } from './ToastProvider';

export default function Providers({ children }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <PreferencesProvider>{children}</PreferencesProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
