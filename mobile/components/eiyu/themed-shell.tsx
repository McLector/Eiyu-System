import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useMemo, type ReactNode } from 'react';

import { useAppTheme } from '@/contexts/theme-store';

/**
 * The navigation theme and status-bar icons follow the app's own theme, not the phone's system setting. The navigation
 * colours come from the palette tokens too: the stock ones would flash their own background behind screen transitions
 * and under the edge-to-edge system bars.
 */
export function ThemedShell({ children }: { children: ReactNode }) {
  const { darkMode, tokens } = useAppTheme();
  const navigationTheme = useMemo<Theme>(() => {
    const base = darkMode ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: tokens['page-flat'],
        card: tokens.nav,
        border: tokens['nav-border'],
        text: tokens.text,
        primary: tokens.accent,
      },
    };
  }, [darkMode, tokens]);
  return (
    <ThemeProvider value={navigationTheme}>
      {children}
      <StatusBar style={darkMode ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
