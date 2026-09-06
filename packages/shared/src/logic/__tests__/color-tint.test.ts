import { tintSecondaryText } from '../color-tint';

describe('tintSecondaryText', () => {
  it('converts a stat/state color to an rgba string at the default opacity', () => {
    expect(tintSecondaryText('#f87171')).toBe('rgba(248,113,113,0.72)');
  });

  it('accepts a custom opacity', () => {
    expect(tintSecondaryText('#67e8f9', 0.5)).toBe('rgba(103,232,249,0.5)');
  });

  it('throws on an unsupported color format rather than silently returning a wrong color', () => {
    expect(() => tintSecondaryText('not-a-color')).toThrow();
  });
});
