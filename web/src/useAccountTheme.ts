import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAccountTheme, resolveThemeOnLoad, saveAccountTheme, type ThemeMode } from '@eiyu/shared';
import { clearThemeUnsynced, markThemeUnsynced, readStoredTheme, readThemeUnsynced, storeTheme } from './theme-storage';

/**
 * The theme follows the account, like the palette: the browser copy paints first, then the account's choice wins. The
 * exception is a pick this browser could not save (the account rejected it, or the tab closed first): that pick is
 * kept and sent again, so an account that has not accepted theme writes yet cannot flip it back on every load.
 * A theme is cosmetic, so a failed read or save never surfaces.
 */
export function useAccountTheme(userId: string | undefined): [ThemeMode, (next: ThemeMode) => void] {
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme() ?? 'dark');
  const picked = useRef(false);

  useEffect(() => {
    if (!userId) return;
    picked.current = false;
    let current = true;
    void fetchAccountTheme(userId).then(account => {
      if (!current || picked.current) return;
      const { theme: next, pushLocal } = resolveThemeOnLoad({ local: readStoredTheme(), account, unsynced: readThemeUnsynced(userId) });
      setTheme(next);
      storeTheme(next);
      if (pushLocal) void saveAccountTheme(next).then(clearThemeUnsynced).catch(() => {});
    });
    return () => { current = false; };
  }, [userId]);

  const change = useCallback((next: ThemeMode) => {
    picked.current = true;
    setTheme(next);
    storeTheme(next);
    if (userId) {
      markThemeUnsynced(userId);
      void saveAccountTheme(next).then(clearThemeUnsynced).catch(() => {});
    }
  }, [userId]);

  return [theme, change];
}
