import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearThemeUnsynced, markThemeUnsynced, readStoredAppearance, readThemeUnsynced, storePalette, storeTheme } from '../appearance-storage';

beforeEach(async () => { await AsyncStorage.clear(); });

describe('appearance storage', () => {
  it('is empty by default', async () => {
    expect(await readStoredAppearance()).toEqual({ theme: null, palette: null });
  });
  it('round-trips a theme and a palette', async () => {
    await storeTheme('light');
    await storePalette('jade');
    expect(await readStoredAppearance()).toEqual({ theme: 'light', palette: 'jade' });
  });
  it('ignores values it does not know', async () => {
    await AsyncStorage.setItem('eiyu:theme', 'LIGHT');
    await AsyncStorage.setItem('eiyu:palette', 'crimson');
    expect(await readStoredAppearance()).toEqual({ theme: null, palette: null });
  });
  it('tracks the unsynced flag per account', async () => {
    expect(await readThemeUnsynced('u1')).toBe(false);
    await markThemeUnsynced('u1');
    expect(await readThemeUnsynced('u1')).toBe(true);
    expect(await readThemeUnsynced('u2')).toBe(false);
    await clearThemeUnsynced();
    expect(await readThemeUnsynced('u1')).toBe(false);
  });
  it('never rejects when storage fails', async () => {
    const boom = new Error('disk');
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(boom).mockRejectedValueOnce(boom).mockRejectedValueOnce(boom);
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(boom).mockRejectedValueOnce(boom).mockRejectedValueOnce(boom);
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(boom);
    await expect(readStoredAppearance()).resolves.toEqual({ theme: null, palette: null });
    await expect(readThemeUnsynced('u1')).resolves.toBe(false);
    await expect(storeTheme('dark')).resolves.toBeUndefined();
    await expect(storePalette('cyan')).resolves.toBeUndefined();
    await expect(markThemeUnsynced('u1')).resolves.toBeUndefined();
    await expect(clearThemeUnsynced()).resolves.toBeUndefined();
  });
});
