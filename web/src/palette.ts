/**
 * The colour palettes on top of the theme. Cyan is the original look and the absence of the attribute; every other
 * palette is a `data-palette` block in index.css with a dark look and a light look. `swatch` is the dark accent, for the picker.
 */
export const PALETTES = [
  { id: 'cyan', label: 'Cyan', swatch: '#67e8f9' },
  { id: 'blue', label: 'System blue', swatch: '#5e9cf0' },
  { id: 'indigo', label: 'Indigo', swatch: '#818cf8' },
  { id: 'violet', label: 'Monarch violet', swatch: '#a78bfa' },
  { id: 'magenta', label: 'Magenta', swatch: '#e879f9' },
  { id: 'steel', label: 'Steel', swatch: '#cbd5e1' },
  { id: 'jade', label: 'Jade', swatch: '#2dd4b0' },
  { id: 'lime', label: 'Lime', swatch: '#a3e635' },
] as const;

export type Palette = (typeof PALETTES)[number]['id'];

export const PALETTE_STORAGE_KEY = 'eiyu:palette';

const IDS: readonly string[] = PALETTES.map(p => p.id);

export function parsePalette(value: unknown): Palette {
  return typeof value === 'string' && IDS.includes(value) ? value as Palette : 'cyan';
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
