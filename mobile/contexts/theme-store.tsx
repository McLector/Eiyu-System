import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import {
  DEFAULT_PALETTE,
  fetchAccountPalette,
  fetchAccountTheme,
  PALETTE_TOKENS,
  resolvePaletteOnLoad,
  resolveThemeOnLoad,
  saveAccountPalette,
  saveAccountTheme,
  type Palette,
  type ThemeMode,
} from '@eiyu/shared';

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
  /** The palette's colour table for the current mode, keyed by the web CSS variable name without `--c-`. */
  tokens: Readonly<Record<string, string>>;
  setMode: (mode: ThemeMode) => void;
  setPalette: (palette: Palette) => void;
}

export const ThemeContext = createContext<AppTheme | null>(null);

/**
 * Theme and palette follow the account, like on web: the device copy paints first, then the account's choice wins.
 * It is read again each time the app returns to the foreground, so a change made on web shows up without a restart.
 * A theme pick the account has not accepted (migration 041 not applied, or the app closed first) is kept and re-sent
 * instead of being overwritten. Nothing here ever surfaces an error: appearance is cosmetic.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [palette, setPaletteState] = useState<Palette>(DEFAULT_PALETTE);
  const [hydrated, setHydrated] = useState(false);
  // Bumped by every pick. An account answer is dropped when a pick happened while it was loading; a pick made long
  // before (and already saved) must not block a later answer, or a change made on web could never arrive.
  const modeEpoch = useRef(0);
  const paletteEpoch = useRef(0);

  useEffect(() => {
    let current = true;
    void readStoredAppearance().then(stored => {
      if (!current) return;
      if (modeEpoch.current === 0 && stored.theme) setModeState(stored.theme);
      if (paletteEpoch.current === 0 && stored.palette) setPaletteState(stored.palette);
      setHydrated(true);
    });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!userId || !hydrated) return;
    let current = true;

    const sync = async () => {
      const modeAtStart = modeEpoch.current;
      const paletteAtStart = paletteEpoch.current;
      const [accountTheme, accountPalette, stored, unsynced] = await Promise.all([
        fetchAccountTheme(userId),
        fetchAccountPalette(userId),
        readStoredAppearance(),
        readThemeUnsynced(userId),
      ]);
      if (!current) return;
      if (modeEpoch.current === modeAtStart) {
        const { theme, pushLocal } = resolveThemeOnLoad({ local: stored.theme, account: accountTheme, unsynced });
        setModeState(theme);
        void storeTheme(theme);
        if (pushLocal) void saveAccountTheme(theme).then(clearThemeUnsynced).catch(() => {});
      }
      if (paletteEpoch.current === paletteAtStart) {
        const resolved = resolvePaletteOnLoad({ account: accountPalette, local: stored.palette });
        if (resolved.storeAccount) {
          setPaletteState(resolved.palette);
          void storePalette(resolved.palette);
        } else if (resolved.pushLocal) {
          void saveAccountPalette(resolved.palette).catch(() => {});
        }
      }
    };

    void sync();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void sync(); });
    return () => {
      current = false;
      subscription.remove();
    };
  }, [userId, hydrated]);

  const setMode = useCallback((next: ThemeMode) => {
    modeEpoch.current += 1;
    setModeState(next);
    void storeTheme(next);
    if (userId) {
      void markThemeUnsynced(userId);
      void saveAccountTheme(next).then(clearThemeUnsynced).catch(() => {});
    }
  }, [userId]);

  const setPalette = useCallback((next: Palette) => {
    paletteEpoch.current += 1;
    setPaletteState(next);
    void storePalette(next);
    if (userId) void saveAccountPalette(next).catch(() => {});
  }, [userId]);

  const value = useMemo<AppTheme>(
    () => ({
      mode,
      palette,
      darkMode: mode === 'dark',
      tokens: PALETTE_TOKENS[palette][mode],
      setMode,
      setPalette,
    }),
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

/** The colour table the design-system primitives read; every colour a primitive draws comes from here. */
export function useTokens(): Readonly<Record<string, string>> {
  return useAppTheme().tokens;
}
