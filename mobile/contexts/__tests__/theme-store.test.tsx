import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockShared = {
  fetchAccountTheme: jest.fn(),
  saveAccountTheme: jest.fn(),
  fetchAccountPalette: jest.fn(),
  saveAccountPalette: jest.fn(),
};
let mockUserId: string | undefined = 'u1';

jest.doMock('@eiyu/shared', () => ({ ...jest.requireActual('@eiyu/shared'), ...mockShared }));
jest.doMock('@/contexts/auth-store', () => ({ useAuth: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }) }));

const { AppThemeProvider, useAppTheme } = require('../theme-store') as typeof import('../theme-store');

let current: ReturnType<typeof useAppTheme> | null = null;
function Probe() {
  current = useAppTheme();
  return <Text>{`${current.mode}/${current.palette}`}</Text>;
}
async function mount() {
  await render(<AppThemeProvider><Probe /></AppThemeProvider>);
  await waitFor(() => expect(current).not.toBeNull());
}

beforeEach(async () => {
  await AsyncStorage.clear();
  current = null;
  mockUserId = 'u1';
  mockShared.fetchAccountTheme.mockReset().mockResolvedValue('dark');
  mockShared.saveAccountTheme.mockReset().mockImplementation(async (t: string) => t);
  mockShared.fetchAccountPalette.mockReset().mockResolvedValue(null);
  mockShared.saveAccountPalette.mockReset().mockImplementation(async (p: string) => p);
});
afterEach(cleanup);

describe('AppThemeProvider', () => {
  it('starts dark and cyan with nothing stored', async () => {
    await mount();
    expect(current!.mode).toBe('dark');
    expect(current!.palette).toBe('cyan');
    expect(current!.darkMode).toBe(true);
  });

  it('paints the stored copy first', async () => {
    await AsyncStorage.setItem('eiyu:theme', 'light');
    await AsyncStorage.setItem('eiyu:palette', 'jade');
    mockShared.fetchAccountTheme.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(current!.mode).toBe('light');
    expect(current!.palette).toBe('jade');
  });

  it('takes the account theme and palette over the stored copy', async () => {
    await AsyncStorage.setItem('eiyu:theme', 'dark');
    mockShared.fetchAccountTheme.mockResolvedValue('light');
    mockShared.fetchAccountPalette.mockResolvedValue('violet');
    await mount();
    await waitFor(() => expect(current!.mode).toBe('light'));
    await waitFor(() => expect(current!.palette).toBe('violet'));
    expect(await AsyncStorage.getItem('eiyu:theme')).toBe('light');
  });

  it('ignores an account palette it does not know', async () => {
    mockShared.fetchAccountPalette.mockResolvedValue('crimson');
    await mount();
    await waitFor(() => expect(mockShared.fetchAccountPalette).toHaveBeenCalled());
    expect(current!.palette).toBe('cyan');
  });

  it('saves a mode change to the account and keeps it when the save is rejected', async () => {
    mockShared.saveAccountTheme.mockRejectedValue(new Error('function not found'));
    await mount();
    await waitFor(() => expect(mockShared.fetchAccountTheme).toHaveBeenCalled());
    await act(async () => { current!.setMode('light'); });
    await waitFor(() => expect(mockShared.saveAccountTheme).toHaveBeenCalledWith('light'));
    expect(current!.mode).toBe('light');
    expect(current!.darkMode).toBe(false);
    expect(await AsyncStorage.getItem('eiyu:theme')).toBe('light');
    await waitFor(async () => expect(await AsyncStorage.getItem('eiyu:theme-unsynced')).toBe('u1'));
  });

  it('keeps an unsynced local theme over the stale account value on the next launch and pushes it again', async () => {
    await AsyncStorage.setItem('eiyu:theme', 'light');
    await AsyncStorage.setItem('eiyu:theme-unsynced', 'u1');
    mockShared.fetchAccountTheme.mockResolvedValue('dark');
    await mount();
    await waitFor(() => expect(mockShared.saveAccountTheme).toHaveBeenCalledWith('light'));
    expect(current!.mode).toBe('light');
  });

  it("does not push another account's unsynced theme", async () => {
    await AsyncStorage.setItem('eiyu:theme', 'light');
    await AsyncStorage.setItem('eiyu:theme-unsynced', 'someone-else');
    mockShared.fetchAccountTheme.mockResolvedValue('dark');
    await mount();
    await waitFor(() => expect(current!.mode).toBe('dark'));
    expect(mockShared.saveAccountTheme).not.toHaveBeenCalled();
  });

  it('lets a pick made before the account answered win', async () => {
    let resolve!: (t: string) => void;
    mockShared.fetchAccountTheme.mockReturnValue(new Promise<string>(r => { resolve = r; }));
    await mount();
    await waitFor(() => expect(mockShared.fetchAccountTheme).toHaveBeenCalled());
    await act(async () => { current!.setMode('light'); });
    await act(async () => { resolve('dark'); });
    expect(current!.mode).toBe('light');
  });

  it('saves a palette change and stays quiet when that fails', async () => {
    mockShared.saveAccountPalette.mockRejectedValue(new Error('denied'));
    await mount();
    await waitFor(() => expect(mockShared.fetchAccountPalette).toHaveBeenCalled());
    await act(async () => { current!.setPalette('lime'); });
    expect(current!.palette).toBe('lime');
    expect(await AsyncStorage.getItem('eiyu:palette')).toBe('lime');
  });

  it('works signed out without calling the account', async () => {
    mockUserId = undefined;
    await mount();
    await act(async () => { current!.setMode('light'); });
    expect(current!.mode).toBe('light');
    expect(mockShared.fetchAccountTheme).not.toHaveBeenCalled();
    expect(mockShared.saveAccountTheme).not.toHaveBeenCalled();
  });

  it('exposes a theme object that follows the palette', async () => {
    await mount();
    const before = current!.theme.accent;
    await act(async () => { current!.setPalette('magenta'); });
    expect(current!.theme.accent).not.toBe(before);
  });
});
