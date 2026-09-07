import { tintSecondaryText } from '../color-tint';
import { contrastRatio } from '../contrast';

const STAT_COLORS = ['#f87171', '#60a5fa', '#fbbf24', '#c084fc', '#fb923c'];

describe('tintSecondaryText', () => {
  it('produces a high-opacity rgba fading toward the background for dark theme', () => {
    expect(tintSecondaryText('#f87171', true)).toBe('rgba(248,113,113,0.85)');
  });

  it('mixes toward a dark base color for light theme instead of fading toward the background', () => {
    expect(tintSecondaryText('#67e8f9', false)).toBe('rgb(52,123,140)');
  });

  it('throws on an unsupported color format rather than silently returning a wrong color', () => {
    expect(() => tintSecondaryText('not-a-color', true)).toThrow();
  });

  describe('WCAG AA compliance (>=4.5:1) for every stat color, both themes', () => {
    const darkBg = '#050b14';
    const lightBg = '#e8f4fb';

    it.each(STAT_COLORS)('dark theme: %s clears 4.5:1 against the flat dark background', (hex) => {
      expect(contrastRatio(tintSecondaryText(hex, true), darkBg)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(STAT_COLORS)('light theme: %s clears 4.5:1 against the flat light background', (hex) => {
      expect(contrastRatio(tintSecondaryText(hex, false), lightBg)).toBeGreaterThanOrEqual(4.5);
    });
  });
});
