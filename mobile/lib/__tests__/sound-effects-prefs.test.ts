import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSoundEffectsEnabled, setSoundEffectsEnabled } from '../sound-effects-prefs';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const mockedStorage = jest.mocked(AsyncStorage);

describe('device-local Sound Effects preference', () => {
  beforeEach(() => jest.clearAllMocks());

  it('defaults to off and persists explicit opt-in', async () => {
    mockedStorage.getItem.mockResolvedValueOnce(null);
    await expect(getSoundEffectsEnabled()).resolves.toBe(false);
    await setSoundEffectsEnabled(true);
    expect(mockedStorage.setItem).toHaveBeenCalledWith('eiyu:sound-effects-enabled', 'true');
  });
});
