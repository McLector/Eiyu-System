import { DEFAULT_THEME, isThemeMode, parseThemeMode, resolveThemeOnLoad } from '../theme-mode';

describe('parseThemeMode', () => {
  it.each(['dark', 'light'])('accepts %s', v => { expect(isThemeMode(v)).toBe(true); expect(parseThemeMode(v)).toBe(v); });
  it.each([null, undefined, '', 'LIGHT', ' dark', 'blue', 'system', 0, 1, true, {}, []])('falls back to dark for %j', v => {
    expect(isThemeMode(v)).toBe(false);
    expect(parseThemeMode(v)).toBe('dark');
  });
  it('defaults to dark', () => { expect(DEFAULT_THEME).toBe('dark'); });
});

describe('resolveThemeOnLoad', () => {
  it('keeps an unsynced local choice and asks to push it (the account never accepted it)', () => {
    expect(resolveThemeOnLoad({ local: 'light', account: 'dark', unsynced: true })).toEqual({ theme: 'light', pushLocal: true });
  });
  it('lets the account win when nothing is waiting to sync', () => {
    expect(resolveThemeOnLoad({ local: 'light', account: 'dark', unsynced: false })).toEqual({ theme: 'dark', pushLocal: false });
    expect(resolveThemeOnLoad({ local: null, account: 'light', unsynced: false })).toEqual({ theme: 'light', pushLocal: false });
  });
  it('keeps the local copy when the account could not be read', () => {
    expect(resolveThemeOnLoad({ local: 'light', account: null, unsynced: false })).toEqual({ theme: 'light', pushLocal: false });
  });
  it('is dark when neither side has a value', () => {
    expect(resolveThemeOnLoad({ local: null, account: null, unsynced: false })).toEqual({ theme: 'dark', pushLocal: false });
  });
  it('ignores the unsynced flag when there is no local value to push', () => {
    expect(resolveThemeOnLoad({ local: null, account: 'light', unsynced: true })).toEqual({ theme: 'light', pushLocal: false });
    expect(resolveThemeOnLoad({ local: null, account: null, unsynced: true })).toEqual({ theme: 'dark', pushLocal: false });
  });
});
