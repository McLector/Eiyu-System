import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';

import { useAppTheme } from '@/contexts/theme-store';

/** The navigation theme and status-bar icons follow the app's own theme, not the phone's system setting. */
export function ThemedShell({ children }: { children: ReactNode }) {
  const { darkMode } = useAppTheme();
  return (
    <ThemeProvider value={darkMode ? DarkTheme : DefaultTheme}>
      {children}
      <StatusBar style={darkMode ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
