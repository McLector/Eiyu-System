/** The colour palette on top of the dark theme. Cyan is the original look; System blue is the HUD-blue preview. */
export type Palette = 'cyan' | 'blue';

export const PALETTE_STORAGE_KEY = 'eiyu:palette';

export function parsePalette(value: unknown): Palette {
  return value === 'blue' ? 'blue' : 'cyan';
}

/** Storage can throw (private windows, blocked site data), and a bad palette must never break the page. */
export function readStoredPalette(): Palette {
  try { return parsePalette(window.localStorage.getItem(PALETTE_STORAGE_KEY)); }
  catch { return 'cyan'; }
}

export function storePalette(palette: Palette): void {
  try { window.localStorage.setItem(PALETTE_STORAGE_KEY, palette); }
  catch { /* The choice still applies for this visit. */ }
}
