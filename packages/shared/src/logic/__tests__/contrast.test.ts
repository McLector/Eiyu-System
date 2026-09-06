import { contrastRatio } from '../contrast';

describe('contrastRatio', () => {
  it('matches the known WCAG maximum for pure black on pure white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('is symmetric — order of foreground/background does not change the ratio', () => {
    const a = contrastRatio('#67e8f9', '#050b14');
    const b = contrastRatio('#050b14', '#67e8f9');
    expect(a).toBeCloseTo(b, 5);
  });

  it('alpha-composites a semi-transparent foreground over the background before computing luminance', () => {
    // A fully-transparent "foreground" contributes nothing — contrast should
    // equal comparing the background against itself (ratio 1).
    expect(contrastRatio('rgba(255,255,255,0)', '#050b14')).toBeCloseTo(1, 1);
  });

  it('flags the redesign spec\'s confirmed failure: dark-theme muted text at 0.55 opacity against the new flat background', () => {
    expect(contrastRatio('rgba(163,210,230,0.55)', '#050b14')).toBeLessThan(4.5);
  });

  it('confirms the redesign spec\'s fix passes: dark-theme muted text raised to 0.62 opacity', () => {
    expect(contrastRatio('rgba(163,210,230,0.62)', '#050b14')).toBeGreaterThanOrEqual(4.5);
  });

  it('throws on an unsupported color format rather than silently miscomputing', () => {
    expect(() => contrastRatio('not-a-color', '#000000')).toThrow();
  });
});
