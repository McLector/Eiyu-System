// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE, PALETTES, PALETTE_STORAGE_KEY, parsePalette, readStoredPalette, readStoredPaletteChoice, storePalette } from '../palette';

afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

describe('parsePalette', () => {
  it.each(PALETTES.map(p => p.id))('accepts %s', id => {
    expect(parsePalette(id)).toBe(id);
  });
  it.each([null, undefined, '', 'BLUE', ' blue', 'Jade', 'red', 'crimson', 'blue ', 'constructor', '__proto__', 0, 1, true, {}, []])('falls back to cyan for %j', value => {
    expect(parsePalette(value)).toBe('cyan');
  });
});

describe('readStoredPaletteChoice', () => {
  it.each(PALETTES.map(p => p.id))('returns the stored %s', id => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, id);
    expect(readStoredPaletteChoice()).toBe(id);
  });
  it('counts a stored cyan as a choice, not as the absence of one', () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'cyan');
    expect(readStoredPaletteChoice()).toBe('cyan');
  });
  it('is null when nothing is stored', () => {
    expect(readStoredPaletteChoice()).toBeNull();
  });
  it.each(['', 'BLUE', ' blue', 'crimson', 'constructor', '__proto__', '<script>'])('is null for the stored value %j, which is not a palette', value => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, value);
    expect(readStoredPaletteChoice()).toBeNull();
  });
  it('is null when storage cannot be read (private window, blocked site data)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(readStoredPaletteChoice()).toBeNull();
  });
});

describe('readStoredPalette', () => {
  it('reads what was stored', () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'blue');
    expect(readStoredPalette()).toBe('blue');
  });
  it('is the default when nothing is stored or the stored value is garbage', () => {
    expect(readStoredPalette()).toBe(DEFAULT_PALETTE);
    window.localStorage.setItem(PALETTE_STORAGE_KEY, '<script>');
    expect(readStoredPalette()).toBe(DEFAULT_PALETTE);
  });
  it('is the default when storage cannot be read (private window, blocked site data)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(readStoredPalette()).toBe(DEFAULT_PALETTE);
  });
  it('takes the fallback from the shared default, not a literal, when storage cannot be read', async () => {
    vi.resetModules();
    vi.doMock('@eiyu/shared', async importActual => ({ ...(await importActual<typeof import('@eiyu/shared')>()), DEFAULT_PALETTE: 'blue' }));
    try {
      const fresh = await import('../palette');
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
      expect(fresh.readStoredPalette()).toBe('blue');
    } finally {
      vi.doUnmock('@eiyu/shared');
      vi.resetModules();
    }
  });
});

describe('storePalette', () => {
  it('writes the choice under the palette key', () => {
    storePalette('blue');
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('blue');
    storePalette('cyan');
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('cyan');
  });
  it('never throws when storage is unavailable or full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(() => storePalette('blue')).not.toThrow();
  });
});
