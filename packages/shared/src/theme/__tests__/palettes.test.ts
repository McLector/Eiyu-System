import { DEFAULT_PALETTE, PALETTES, isPalette, parsePalette } from '../palettes';

describe('PALETTES', () => {
  it('lists the eight palettes, cyan first, no duplicates', () => {
    expect(PALETTES.map(p => p.id)).toEqual(['cyan', 'blue', 'indigo', 'violet', 'magenta', 'steel', 'jade', 'lime']);
    expect(new Set(PALETTES.map(p => p.id)).size).toBe(PALETTES.length);
    expect(DEFAULT_PALETTE).toBe('cyan');
  });
  it('gives each palette a label and a hex swatch', () => {
    for (const p of PALETTES) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.swatch).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('parsePalette / isPalette', () => {
  it.each(PALETTES.map(p => p.id))('accepts %s', id => {
    expect(isPalette(id)).toBe(true);
    expect(parsePalette(id)).toBe(id);
  });
  it.each([null, undefined, '', 'BLUE', ' blue', 'Jade', 'red', 'blue ', 'constructor', '__proto__', 0, 1, true, {}, []])(
    'falls back to cyan for %j', value => {
      expect(isPalette(value)).toBe(false);
      expect(parsePalette(value)).toBe('cyan');
    });
});
