import { PALETTES, type Palette } from '../palettes';
import { PALETTE_TOKENS } from '../palette-tokens';

const REQUIRED = ['text', 'muted', 'dim', 'accent', 'accent-text', 'accent-glass', 'accent-hover', 'accent-border', 'accent-strong',
  'glass', 'glass-sm', 'glass-border', 'track', 'modal', 'overlay', 'nav', 'nav-border', 'nav-dim', 'body', 'page-flat',
  'panel-flat', 'panel-border', 'divider-flat', 'muted-flat', 'dim-flat', 'on-accent', 'bar-track', 'danger', 'success', 'warning'];
const IDS: Palette[] = PALETTES.map(p => p.id);

describe('PALETTE_TOKENS', () => {
  it.each(IDS)('%s has every required token in both themes', id => {
    for (const mode of ['dark', 'light'] as const) {
      const missing = REQUIRED.filter(name => typeof PALETTE_TOKENS[id][mode][name] !== 'string');
      expect(missing).toEqual([]);
    }
  });
  it('uses each palette swatch as its dark accent', () => {
    for (const p of PALETTES) expect(PALETTE_TOKENS[p.id].dark.accent.toLowerCase()).toBe(p.swatch);
  });
});
