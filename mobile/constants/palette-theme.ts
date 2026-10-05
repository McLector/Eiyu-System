import { PALETTE_TOKENS, type Palette, type ThemeMode } from '@eiyu/shared';

import type { EiyuTheme } from '@/constants/eiyu-theme';

/**
 * Compatibility mapping: the screens still read the old EiyuTheme keys, but the values now come from the shared palette
 * tokens, so a palette applies everywhere at once. The page gradient is flattened to the web's flat surface colour.
 * Slice 5 deletes this once every screen reads the new tokens directly.
 */
export function buildEiyuTheme(mode: ThemeMode, palette: Palette): EiyuTheme {
  const t = PALETTE_TOKENS[palette][mode];
  const page = t['page-flat'];
  return {
    text: t['text'],
    muted: t['muted'],
    dim: t['dim'],
    accent: t['accent'],
    accentGlass: t['accent-glass'],
    accentHover: t['accent-hover'],
    accentBorder: t['accent-border'],
    accentStrong: t['accent-strong'],
    glass: t['glass'],
    glassSm: t['glass-sm'],
    glassBorder: t['glass-border'],
    track: t['track'],
    modal: t['modal'],
    overlay: t['overlay'],
    nav: t['nav'],
    navBorder: t['nav-border'],
    navDim: t['nav-dim'],
    pageGradient: [page, page, page],
    body: page,
  };
}
