import type { ThemeMode } from './palettes';

export const DEFAULT_THEME: ThemeMode = 'dark';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light';
}

export function parseThemeMode(value: unknown): ThemeMode {
  return isThemeMode(value) ? value : DEFAULT_THEME;
}

/**
 * Which theme to show once the account has answered. The account normally wins, but a choice this device made and
 * could not save (`unsynced`: the save failed or the app closed first) wins instead and is pushed again, so an account
 * that has not accepted the write yet cannot flip the theme back on every launch.
 */
export function resolveThemeOnLoad(input: { local: ThemeMode | null; account: ThemeMode | null; unsynced: boolean }): { theme: ThemeMode; pushLocal: boolean } {
  const { local, account, unsynced } = input;
  if (unsynced && local) return { theme: local, pushLocal: true };
  if (account) return { theme: account, pushLocal: false };
  return { theme: local ?? DEFAULT_THEME, pushLocal: false };
}
