import { isThemeMode, type ThemeMode } from '@eiyu/shared';

export const THEME_STORAGE_KEY = 'eiyu:theme';
/** Holds the id of the account a saved-on-this-device theme still has to be sent to. */
export const THEME_UNSYNCED_KEY = 'eiyu:theme-unsynced';

/** Storage can throw (private windows, blocked site data); a theme must never break the page. */
export function readStoredTheme(): ThemeMode | null {
  try { const value = window.localStorage.getItem(THEME_STORAGE_KEY); return isThemeMode(value) ? value : null; }
  catch { return null; }
}

export function storeTheme(theme: ThemeMode): void {
  try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); }
  catch { /* The choice still applies for this visit. */ }
}

export function readThemeUnsynced(userId: string): boolean {
  try { return window.localStorage.getItem(THEME_UNSYNCED_KEY) === userId; }
  catch { return false; }
}

export function markThemeUnsynced(userId: string): void {
  try { window.localStorage.setItem(THEME_UNSYNCED_KEY, userId); }
  catch { /* Nothing to remember it with. */ }
}

export function clearThemeUnsynced(): void {
  try { window.localStorage.removeItem(THEME_UNSYNCED_KEY); }
  catch { /* Nothing to clear. */ }
}
