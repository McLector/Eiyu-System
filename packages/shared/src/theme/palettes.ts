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

/** What an account or device with no saved choice shows. Cyan stays a real choice, and an explicit cyan is kept. */
export const DEFAULT_PALETTE: Palette = 'blue';

const IDS: readonly string[] = PALETTES.map(p => p.id);

export function isPalette(value: unknown): value is Palette {
  return typeof value === 'string' && IDS.includes(value);
}

export function parsePalette(value: unknown): Palette {
  return isPalette(value) ? value : DEFAULT_PALETTE;
}

/**
 * Which palette to show once the account has answered. `account` is the palette the account chose, `null` when it has
 * no choice, or `undefined` when the read failed. A choice this device made (`local`) fills in only when the account has
 * no choice, and is pushed so the account adopts it; cyan counts as a choice. A failed read keeps the local copy and
 * pushes nothing, so a flaky read cannot overwrite the account. A stored value that is not a palette counts as a failed
 * read.
 */
export function resolvePaletteOnLoad(input: { account: string | null | undefined; local: Palette | null }): { palette: Palette; pushLocal: boolean; storeAccount: boolean } {
  const { account, local } = input;
  if (isPalette(account)) return { palette: account, pushLocal: false, storeAccount: true };
  if (account === null && local) return { palette: local, pushLocal: true, storeAccount: false };
  return { palette: local ?? DEFAULT_PALETTE, pushLocal: false, storeAccount: false };
}
