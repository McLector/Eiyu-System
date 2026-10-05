import { parsePalette, type Palette } from '@eiyu/shared';

// The palette list and parsing live in the shared package so mobile uses the same ids; this file keeps the browser storage.
export { PALETTES, isPalette, parsePalette, type Palette } from '@eiyu/shared';

export const PALETTE_STORAGE_KEY = 'eiyu:palette';

/** Storage can throw (private windows, blocked site data), and a bad palette must never break the page. */
export function readStoredPalette(): Palette {
  try { return parsePalette(window.localStorage.getItem(PALETTE_STORAGE_KEY)); }
  catch { return 'cyan'; }
}

export function storePalette(palette: Palette): void {
  try { window.localStorage.setItem(PALETTE_STORAGE_KEY, palette); }
  catch { /* The choice still applies for this visit. */ }
}
