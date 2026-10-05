/**
 * The colour palettes on top of the theme. Cyan is the original look; every other palette is a `data-palette` block in
 * web/src/index.css with a dark and a light look (mirrored in palette-tokens.ts). `swatch` is the dark accent, for pickers.
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

export type ThemeMode = 'dark' | 'light';

export const DEFAULT_PALETTE: Palette = 'cyan';

const IDS: readonly string[] = PALETTES.map(p => p.id);

export function isPalette(value: unknown): value is Palette {
  return typeof value === 'string' && IDS.includes(value);
}

export function parsePalette(value: unknown): Palette {
  return isPalette(value) ? value : DEFAULT_PALETTE;
}
