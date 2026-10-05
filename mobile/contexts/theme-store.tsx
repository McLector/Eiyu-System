import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  fetchAccountPalette,
  fetchAccountTheme,
  isPalette,
  resolveThemeOnLoad,
  saveAccountPalette,
  saveAccountTheme,
  type Palette,
  type ThemeMode,
} from '@eiyu/shared';

import type { EiyuTheme } from '@/constants/eiyu-theme';
import { buildEiyuTheme } from '@/constants/palette-theme';
import { useAuth } from '@/contexts/auth-store';
import {
  clearThemeUnsynced,
  markThemeUnsynced,
  readStoredAppearance,
  readThemeUnsynced,
  storePalette,
  storeTheme,
} from '@/lib/appearance-storage';

interface AppTheme {
  mode: ThemeMode;
  palette: Palette;
  darkMode: boolean;
  theme: EiyuTheme;
  setMode: (mode: ThemeMode) => void;
  setPalette: (palette: Palette) => void;
}

const ThemeContext = createContext<AppTheme | null>(null);

/**
 * Theme and palette follow the account, like on web: the device copy paints first, then the account's choice wins.
 * A theme pick the account has not accepted (migration 041 not applied, or the app closed first) is kept and re-sent
 * on the next launch instead of being overwritten. Nothing here ever surfaces an error: appearance is cosmetic.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [palette, setPaletteState] = useState<Palette>('cyan');
  const [hydrated, setHydrated] = useState(false);
  const pickedMode = useRef(false);
  const pickedPalette = useRef(false);

  useEffect(() => {
    let current = true;
    void readStoredAppearance().then(stored => {
      if (!current) return;
      if (!pickedMode.current && stored.theme) setModeState(stored.theme);
      if (!pickedPalette.current && stored.palette) setPaletteState(stored.palette);
      setHydrated(true);
    });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!userId || !hydrated) return;
    pickedMode.current = false;
    pickedPalette.current = false;
    let current = true;
    void (async () => {
      const [accountTheme, accountPalette, stored, unsynced] = await Promise.all([
        fetchAccountTheme(userId),
        fetchAccountPalette(userId),
        readStoredAppearance(),
        readThemeUnsynced(userId),
      ]);
      if (!current) return;
      if (!pickedMode.current) {
        const { theme, pushLocal } = resolveThemeOnLoad({ local: stored.theme, account: accountTheme, unsynced });
        setModeState(theme);
        void storeTheme(theme);
        if (pushLocal) void saveAccountTheme(theme).then(clearThemeUnsynced).catch(() => {});
      }
      if (!pickedPalette.current) {
        if (accountPalette === null) {
          if (stored.palette && stored.palette !== 'cyan') void saveAccountPalette(stored.palette).catch(() => {});
        } else if (isPalette(accountPalette)) {
          setPaletteState(accountPalette);
          void storePalette(accountPalette);
        }
      }
    })();
    return () => { current = false; };
  }, [userId, hydrated]);

  const setMode = useCallback((next: ThemeMode) => {
    pickedMode.current = true;
    setModeState(next);
    void storeTheme(next);
    if (userId) {
      void markThemeUnsynced(userId);
      void saveAccountTheme(next).then(clearThemeUnsynced).catch(() => {});
    }
  }, [userId]);

  const setPalette = useCallback((next: Palette) => {
    pickedPalette.current = true;
    setPaletteState(next);
    void storePalette(next);
    if (userId) void saveAccountPalette(next).catch(() => {});
  }, [userId]);

  const value = useMemo<AppTheme>(
    () => ({ mode, palette, darkMode: mode === 'dark', theme: buildEiyuTheme(mode, palette), setMode, setPalette }),
    [mode, palette, setMode, setPalette],
  );

  // Hold the splash screen a moment so the first frame is already in the stored colours.
  if (!hydrated) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): AppTheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used inside AppThemeProvider');
  return ctx;
}
