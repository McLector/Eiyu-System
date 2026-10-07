import { DEFAULT_PALETTE, isPalette, type Palette } from '@eiyu/shared';

// The palette list, the default and parsing live in the shared package so mobile uses the same ids; this file keeps the browser storage.
export { DEFAULT_PALETTE, PALETTES, isPalette, parsePalette, type Palette } from '@eiyu/shared';

export const PALETTE_STORAGE_KEY = 'eiyu:palette';

/**
 * The palette this browser has stored, or null when it has stored none or a value that is not a palette. Cyan is a
 * real choice, so it comes back as 'cyan', not as null. Storage can throw (private windows, blocked site data), and a
 * bad palette must never break the page, so a failed read is also null.
 */
export function readStoredPaletteChoice(): Palette | null {
  try {
    const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    return isPalette(stored) ? stored : null;
  } catch { return null; }
}

/** The palette to show before the account answers: the stored choice, or the shared default. */
export function readStoredPalette(): Palette {
  return readStoredPaletteChoice() ?? DEFAULT_PALETTE;
}

export function storePalette(palette: Palette): void {
  try { window.localStorage.setItem(PALETTE_STORAGE_KEY, palette); }
  catch { /* The choice still applies for this visit. */ }
}
