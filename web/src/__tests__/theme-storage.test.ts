// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, THEME_UNSYNCED_KEY, clearThemeUnsynced, markThemeUnsynced, readStoredTheme, readThemeUnsynced, storeTheme } from '../theme-storage';

afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

describe('theme storage', () => {
  it('round-trips a theme', () => {
    storeTheme('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(readStoredTheme()).toBe('light');
  });
  it.each(['LIGHT', '', 'blue', '<script>'])('treats the stored value %j as none', v => {
    window.localStorage.setItem(THEME_STORAGE_KEY, v);
    expect(readStoredTheme()).toBeNull();
  });
  it('is none when nothing is stored', () => { expect(readStoredTheme()).toBeNull(); });
  it('tracks the unsynced flag per account', () => {
    expect(readThemeUnsynced('u1')).toBe(false);
    markThemeUnsynced('u1');
    expect(window.localStorage.getItem(THEME_UNSYNCED_KEY)).toBe('u1');
    expect(readThemeUnsynced('u1')).toBe(true);
    expect(readThemeUnsynced('u2')).toBe(false);
    clearThemeUnsynced();
    expect(readThemeUnsynced('u1')).toBe(false);
  });
  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(readStoredTheme()).toBeNull();
    expect(readThemeUnsynced('u1')).toBe(false);
    expect(() => { storeTheme('light'); markThemeUnsynced('u1'); clearThemeUnsynced(); }).not.toThrow();
  });
});
