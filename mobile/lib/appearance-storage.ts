import AsyncStorage from '@react-native-async-storage/async-storage';
import { isPalette, isThemeMode, type Palette, type ThemeMode } from '@eiyu/shared';

const THEME_KEY = 'eiyu:theme';
const PALETTE_KEY = 'eiyu:palette';
/** Holds the id of the account a saved-on-this-device theme still has to be sent to. */
const UNSYNCED_KEY = 'eiyu:theme-unsynced';

/** Storage can fail; a theme must never break the app, so nothing here rejects. */
export async function readStoredAppearance(): Promise<{ theme: ThemeMode | null; palette: Palette | null }> {
  try {
    const [theme, palette] = await Promise.all([AsyncStorage.getItem(THEME_KEY), AsyncStorage.getItem(PALETTE_KEY)]);
    return { theme: isThemeMode(theme) ? theme : null, palette: isPalette(palette) ? palette : null };
  } catch {
    return { theme: null, palette: null };
  }
}

export async function storeTheme(theme: ThemeMode): Promise<void> {
  try { await AsyncStorage.setItem(THEME_KEY, theme); } catch { /* applies for this session */ }
}

export async function storePalette(palette: Palette): Promise<void> {
  try { await AsyncStorage.setItem(PALETTE_KEY, palette); } catch { /* applies for this session */ }
}

export async function readThemeUnsynced(userId: string): Promise<boolean> {
  try { return (await AsyncStorage.getItem(UNSYNCED_KEY)) === userId; } catch { return false; }
}

export async function markThemeUnsynced(userId: string): Promise<void> {
  try { await AsyncStorage.setItem(UNSYNCED_KEY, userId); } catch { /* nothing to remember it with */ }
}

export async function clearThemeUnsynced(): Promise<void> {
  try { await AsyncStorage.removeItem(UNSYNCED_KEY); } catch { /* nothing to clear */ }
}
