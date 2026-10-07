import { DEFAULT_PALETTE, PALETTES, isPalette, parsePalette, resolvePaletteOnLoad, type Palette } from '../palettes';

describe('PALETTES', () => {
  it('lists the eight palettes, cyan first, no duplicates', () => {
    expect(PALETTES.map(p => p.id)).toEqual(['cyan', 'blue', 'indigo', 'violet', 'magenta', 'steel', 'jade', 'lime']);
    expect(new Set(PALETTES.map(p => p.id)).size).toBe(PALETTES.length);
    expect(DEFAULT_PALETTE).toBe('blue');
  });
  it('defaults to System blue, not cyan: an account or device with no choice gets blue', () => {
    expect(DEFAULT_PALETTE).toBe('blue');
    expect(DEFAULT_PALETTE).not.toBe('cyan');
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
    'falls back to System blue for %j', value => {
      expect(isPalette(value)).toBe(false);
      expect(parsePalette(value)).toBe('blue');
    });
});

describe('resolvePaletteOnLoad', () => {
  const IDS: Palette[] = PALETTES.map(p => p.id);
  const otherThan = (id: Palette): Palette => IDS[(IDS.indexOf(id) + 1) % IDS.length];

  it('shows System blue when neither the account nor this device has a choice', () => {
    expect(resolvePaletteOnLoad({ account: null, local: null }).palette).toBe('blue');
    expect(resolvePaletteOnLoad({ account: undefined, local: null }).palette).toBe('blue');
  });

  it('takes the account palette and stores it on this device, never pushing', () => {
    expect(resolvePaletteOnLoad({ account: 'jade', local: null })).toEqual({ palette: 'jade', pushLocal: false, storeAccount: true });
    expect(resolvePaletteOnLoad({ account: 'jade', local: 'violet' })).toEqual({ palette: 'jade', pushLocal: false, storeAccount: true });
  });

  it.each(IDS)('returns the account palette %s, stored and not pushed, whatever this device holds', id => {
    expect(resolvePaletteOnLoad({ account: id, local: null })).toEqual({ palette: id, pushLocal: false, storeAccount: true });
    expect(resolvePaletteOnLoad({ account: id, local: otherThan(id) })).toEqual({ palette: id, pushLocal: false, storeAccount: true });
    expect(resolvePaletteOnLoad({ account: id, local: id })).toEqual({ palette: id, pushLocal: false, storeAccount: true });
  });

  it('pushes the local palette when the account has no choice, cyan included', () => {
    expect(resolvePaletteOnLoad({ account: null, local: 'cyan' })).toEqual({ palette: 'cyan', pushLocal: true, storeAccount: false });
    expect(resolvePaletteOnLoad({ account: null, local: 'violet' })).toEqual({ palette: 'violet', pushLocal: true, storeAccount: false });
  });

  it.each(IDS)('pushes local %s when the account has no choice', id => {
    expect(resolvePaletteOnLoad({ account: null, local: id })).toEqual({ palette: id, pushLocal: true, storeAccount: false });
  });

  it('falls back to the default, with nothing to push, when neither side has a choice', () => {
    expect(resolvePaletteOnLoad({ account: null, local: null })).toEqual({ palette: DEFAULT_PALETTE, pushLocal: false, storeAccount: false });
  });

  it('keeps the local palette and never pushes when the read failed (undefined account)', () => {
    expect(resolvePaletteOnLoad({ account: undefined, local: 'violet' })).toEqual({ palette: 'violet', pushLocal: false, storeAccount: false });
    expect(resolvePaletteOnLoad({ account: undefined, local: 'cyan' })).toEqual({ palette: 'cyan', pushLocal: false, storeAccount: false });
  });

  it.each(IDS)('never pushes local %s when the read failed', id => {
    expect(resolvePaletteOnLoad({ account: undefined, local: id })).toEqual({ palette: id, pushLocal: false, storeAccount: false });
  });

  it('falls back to the default, with nothing to push, when the read failed and this device has no choice', () => {
    expect(resolvePaletteOnLoad({ account: undefined, local: null })).toEqual({ palette: DEFAULT_PALETTE, pushLocal: false, storeAccount: false });
  });

  it.each(['crimson', '', 'Jade', ' jade', 'jade ', 'constructor', '__proto__'])(
    'treats the non-palette account %j as a failed read: keeps local, never pushes',
    account => {
      expect(resolvePaletteOnLoad({ account, local: 'violet' })).toEqual({ palette: 'violet', pushLocal: false, storeAccount: false });
      expect(resolvePaletteOnLoad({ account, local: 'cyan' })).toEqual({ palette: 'cyan', pushLocal: false, storeAccount: false });
      expect(resolvePaletteOnLoad({ account, local: null })).toEqual({ palette: DEFAULT_PALETTE, pushLocal: false, storeAccount: false });
    });
});
