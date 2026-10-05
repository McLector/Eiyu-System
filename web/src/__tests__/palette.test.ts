// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PALETTE_STORAGE_KEY, parsePalette, readStoredPalette, storePalette } from '../palette';

afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

describe('parsePalette', () => {
  it('accepts the two palettes', () => {
    expect(parsePalette('blue')).toBe('blue');
    expect(parsePalette('cyan')).toBe('cyan');
  });
  it.each([null, undefined, '', 'BLUE', ' blue', 'red', 'blue ', 0, 1, true, {}, []])('falls back to cyan for %j', value => {
    expect(parsePalette(value)).toBe('cyan');
  });
});

describe('readStoredPalette', () => {
  it('reads what was stored', () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'blue');
    expect(readStoredPalette()).toBe('blue');
  });
  it('is cyan when nothing is stored or the stored value is garbage', () => {
    expect(readStoredPalette()).toBe('cyan');
    window.localStorage.setItem(PALETTE_STORAGE_KEY, '<script>');
    expect(readStoredPalette()).toBe('cyan');
  });
  it('is cyan when storage cannot be read (private window, blocked site data)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(readStoredPalette()).toBe('cyan');
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
