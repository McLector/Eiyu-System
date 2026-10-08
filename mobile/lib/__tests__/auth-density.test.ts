import { AUTH_COMPACT_MIN_HEIGHT, AUTH_ROOMY_MIN_HEIGHT, authDensity } from '../auth-density';

describe('authDensity', () => {
  it('keeps the thresholds ordered and sane', () => {
    expect(AUTH_ROOMY_MIN_HEIGHT).toBeGreaterThan(AUTH_COMPACT_MIN_HEIGHT);
    expect(AUTH_COMPACT_MIN_HEIGHT).toBeGreaterThan(600);
  });

  it("is roomy, with today's exact values, on a tall window", () => {
    expect(authDensity(AUTH_ROOMY_MIN_HEIGHT, 1)).toEqual({
      tier: 'roomy', scrollPadV: 32, brandMargin: 28, logoSize: 56, logoGap: 14, logoGlyph: 24, titleSize: 28,
      cardPadTop: 22, cardPadBottom: 20, cardPadX: 20, accentGap: 20, formGap: 14, switchGap: 12,
    });
  });

  it('is compact on a medium window', () => {
    const d = authDensity(AUTH_ROOMY_MIN_HEIGHT - 1, 1);
    expect(d.tier).toBe('compact');
    expect(authDensity(AUTH_COMPACT_MIN_HEIGHT, 1).tier).toBe('compact');
    expect(d).toMatchObject({ logoSize: 44, titleSize: 22, formGap: 10, brandMargin: 12, scrollPadV: 12 });
  });

  it('is tight on a short window', () => {
    const d = authDensity(AUTH_COMPACT_MIN_HEIGHT - 1, 1);
    expect(d.tier).toBe('tight');
    expect(d).toMatchObject({ logoSize: 36, titleSize: 20, formGap: 8, brandMargin: 8, scrollPadV: 8 });
    expect(authDensity(300, 1).tier).toBe('tight');
  });

  it('moves down a tier as the font scale grows, because text then takes more of the height', () => {
    expect(authDensity(AUTH_ROOMY_MIN_HEIGHT, 1).tier).toBe('roomy');
    expect(authDensity(AUTH_ROOMY_MIN_HEIGHT, 1.3).tier).not.toBe('roomy');
    expect(authDensity(AUTH_COMPACT_MIN_HEIGHT, 1.3).tier).toBe('tight');
  });

  it('treats a font scale below 1 like 1: smaller text never makes the layout roomier', () => {
    expect(authDensity(AUTH_ROOMY_MIN_HEIGHT - 1, 0.85).tier).toBe('compact');
    expect(authDensity(AUTH_ROOMY_MIN_HEIGHT - 1, 0.85)).toEqual(authDensity(AUTH_ROOMY_MIN_HEIGHT - 1, 1));
  });

  it('is never roomier for a shorter window or a bigger font', () => {
    const rank = { roomy: 2, compact: 1, tight: 0 } as const;
    for (const scale of [1, 1.15, 1.3, 1.5, 2]) {
      let previous = 3;
      for (let height = 1200; height >= 300; height -= 5) {
        const r = rank[authDensity(height, scale).tier];
        expect(r).toBeLessThanOrEqual(previous);
        previous = r;
      }
    }
  });

  it('only shrinks spacing and decoration, never below the floor that keeps the screen readable', () => {
    for (const height of [300, AUTH_COMPACT_MIN_HEIGHT, AUTH_ROOMY_MIN_HEIGHT]) {
      const d = authDensity(height, 1);
      expect(d.logoSize).toBeGreaterThanOrEqual(36);
      expect(d.titleSize).toBeGreaterThanOrEqual(20);
      expect(d.logoGlyph).toBeLessThan(d.logoSize);
      expect(d.cardPadX).toBeGreaterThanOrEqual(14);
    }
  });

  it.each([[NaN], [Infinity], [-Infinity], [0], [-100]])("keeps today's look for a height of %s (no usable information)", height => {
    expect(authDensity(height, 1).tier).toBe('roomy');
  });

  it.each([[NaN], [0], [-2], [Infinity]])('treats a font scale of %s as 1', scale => {
    expect(authDensity(AUTH_COMPACT_MIN_HEIGHT, scale)).toEqual(authDensity(AUTH_COMPACT_MIN_HEIGHT, 1));
  });
});
