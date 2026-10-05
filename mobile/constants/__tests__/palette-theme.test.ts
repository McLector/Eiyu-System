import { PALETTES, type Palette } from '@eiyu/shared';
import { buildEiyuTheme } from '../palette-theme';

const KEYS = ['text', 'muted', 'dim', 'accent', 'accentGlass', 'accentHover', 'accentBorder', 'accentStrong', 'glass', 'glassSm',
  'glassBorder', 'track', 'modal', 'overlay', 'nav', 'navBorder', 'navDim', 'body'] as const;
const COMBOS: Array<[Palette, 'dark' | 'light']> = PALETTES.flatMap(p => (['dark', 'light'] as const).map(m => [p.id, m] as [Palette, 'dark' | 'light']));

describe('buildEiyuTheme', () => {
  it.each(COMBOS)('%s %s fills every EiyuTheme key with a colour', (id, mode) => {
    const theme = buildEiyuTheme(mode, id);
    for (const key of KEYS) expect(theme[key]).toMatch(/^(#[0-9a-f]{3,8}|rgba?\()/i);
    expect(theme.pageGradient).toHaveLength(3);
    for (const stop of theme.pageGradient) expect(stop).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('uses the palette accent in dark mode', () => {
    for (const p of PALETTES) expect(buildEiyuTheme('dark', p.id).accent.toLowerCase()).toBe(p.swatch);
  });
  it('flattens the page: the three gradient stops are one colour', () => {
    const { pageGradient } = buildEiyuTheme('light', 'jade');
    expect(new Set(pageGradient).size).toBe(1);
  });
  it('differs between dark and light, and between palettes', () => {
    expect(buildEiyuTheme('dark', 'cyan').text).not.toBe(buildEiyuTheme('light', 'cyan').text);
    expect(buildEiyuTheme('dark', 'cyan').accent).not.toBe(buildEiyuTheme('dark', 'violet').accent);
  });
});
