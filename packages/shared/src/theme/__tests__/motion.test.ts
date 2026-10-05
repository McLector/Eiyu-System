import { MOTION } from '../motion';
import { TYPE } from '../type';

describe('MOTION', () => {
  it('has the four durations, in ms', () => {
    expect(MOTION.durPress).toBe(160);
    expect(MOTION.durFast).toBe(150);
    expect(MOTION.durBase).toBe(200);
    expect(MOTION.durSlow).toBe(300);
  });
  it('has cubic-bezier control points that are valid easings', () => {
    for (const curve of [MOTION.easeOut, MOTION.easeInOut, MOTION.easeDrawer]) {
      expect(curve).toHaveLength(4);
      for (const n of curve) expect(Number.isFinite(n)).toBe(true);
      // x coordinates must stay inside [0, 1] for a valid cubic-bezier.
      expect(curve[0]).toBeGreaterThanOrEqual(0);
      expect(curve[0]).toBeLessThanOrEqual(1);
      expect(curve[2]).toBeGreaterThanOrEqual(0);
      expect(curve[2]).toBeLessThanOrEqual(1);
    }
  });
  it('presses down a little, not a lot', () => {
    expect(MOTION.pressScale).toBeGreaterThan(0.9);
    expect(MOTION.pressScale).toBeLessThan(1);
  });
});

describe('TYPE', () => {
  it('names the three families', () => {
    expect(TYPE.display.family).toBe('Rajdhani');
    expect(TYPE.body.family).toBe('Inter');
    expect(TYPE.mono.family).toBe('JetBrainsMono');
  });
  it('keeps every ramp size a whole number of at least 11', () => {
    for (const size of Object.values(TYPE.ramp)) {
      expect(Number.isInteger(size)).toBe(true);
      expect(size).toBeGreaterThanOrEqual(11);
    }
  });
  it('grows from label to heading', () => {
    const { label, caption, body, bodyLg, title, heading } = TYPE.ramp;
    expect([label, caption, body, bodyLg, title, heading]).toEqual([...[label, caption, body, bodyLg, title, heading]].sort((a, b) => a - b));
  });
});
