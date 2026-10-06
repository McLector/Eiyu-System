import { RADIUS, SPACE, TAB_BAR, TOUCH_TARGET, tabBarHeight } from '../spacing';

describe('spacing tokens', () => {
  it('keeps the space scale strictly increasing, in whole dp', () => {
    const values = Object.values(SPACE);
    expect(values.every(v => Number.isInteger(v) && v > 0)).toBe(true);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    expect(new Set(values).size).toBe(values.length);
  });

  it('matches the literals the screens already use: 8 and 14 gaps, 16 gutter, radius 4', () => {
    expect(SPACE.sm).toBe(8);
    expect(SPACE.md).toBe(14);
    expect(SPACE.gutter).toBe(16);
    expect(RADIUS.control).toBe(4);
  });

  it('never goes below the 48dp touch target', () => {
    expect(TOUCH_TARGET).toBe(48);
  });

  describe('tabBarHeight', () => {
    it('adds the navigation bar inset to the base height', () => {
      expect(tabBarHeight(1, 24)).toBe(TAB_BAR.base + 24);
      expect(tabBarHeight(1, 48) - tabBarHeight(1, 24)).toBe(24);
    });
    it('grows with the font scale and never shrinks below the base', () => {
      expect(tabBarHeight(2, 0)).toBeGreaterThan(tabBarHeight(1, 0));
      expect(tabBarHeight(0.8, 0)).toBe(TAB_BAR.base);
    });
    it('caps the growth so an absurd font scale cannot eat the screen', () => {
      expect(tabBarHeight(5, 0)).toBe(tabBarHeight(2, 0));
    });
    it('treats a negative or missing inset as zero', () => {
      expect(tabBarHeight(1, -10)).toBe(TAB_BAR.base);
      expect(tabBarHeight(1, Number.NaN)).toBe(TAB_BAR.base);
    });
  });
});
