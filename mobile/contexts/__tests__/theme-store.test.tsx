import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';

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

const { AppThemeProvider, useAppTheme, useTokens } = require('../theme-store') as typeof import('../theme-store');
const { PALETTE_TOKENS } = jest.requireActual('@eiyu/shared') as typeof import('@eiyu/shared');

let current: ReturnType<typeof useAppTheme> | null = null;
let currentTokens: ReturnType<typeof useTokens> | null = null;
function Probe() {
  current = useAppTheme();
  currentTokens = useTokens();
  return <Text>{`${current.mode}/${current.palette}`}</Text>;
}
async function mount() {
  await render(<AppThemeProvider><Probe /></AppThemeProvider>);
  await waitFor(() => expect(current).not.toBeNull());
}

const appStateHandlers: Array<(state: string) => void> = [];
const appStateRemove = jest.fn();
let appStateSpy: jest.SpyInstance;
const toForeground = () => act(async () => { appStateHandlers[appStateHandlers.length - 1]('active'); });

beforeEach(async () => {
  appStateHandlers.length = 0;
  appStateRemove.mockClear();
  appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: string, handler: (state: string) => void) => {
    appStateHandlers.push(handler);
    return { remove: appStateRemove };
  }) as never);
  await AsyncStorage.clear();
  current = null;
  mockUserId = 'u1';
  mockShared.fetchAccountTheme.mockReset().mockResolvedValue('dark');
  mockShared.saveAccountTheme.mockReset().mockImplementation(async (t: string) => t);
  mockShared.fetchAccountPalette.mockReset().mockResolvedValue(null);
  mockShared.saveAccountPalette.mockReset().mockImplementation(async (p: string) => p);
});
afterEach(() => { cleanup(); appStateSpy.mockRestore(); });

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

describe('AppThemeProvider when the app returns to the foreground', () => {
  it('picks up a theme and palette changed elsewhere (the web app) while the app was in the background', async () => {
    mockShared.fetchAccountTheme.mockResolvedValue('light');
    mockShared.fetchAccountPalette.mockResolvedValue('jade');
    await mount();
    await waitFor(() => expect(current!.palette).toBe('jade'));
    mockShared.fetchAccountTheme.mockResolvedValue('dark');
    mockShared.fetchAccountPalette.mockResolvedValue('violet');
    await toForeground();
    await waitFor(() => expect(current!.mode).toBe('dark'));
    await waitFor(() => expect(current!.palette).toBe('violet'));
    expect(await AsyncStorage.getItem('eiyu:palette')).toBe('violet');
  });

  it('does nothing for the background and inactive states', async () => {
    await mount();
    await waitFor(() => expect(mockShared.fetchAccountTheme).toHaveBeenCalledTimes(1));
    await act(async () => { appStateHandlers[appStateHandlers.length - 1]('background'); });
    await act(async () => { appStateHandlers[appStateHandlers.length - 1]('inactive'); });
    expect(mockShared.fetchAccountTheme).toHaveBeenCalledTimes(1);
  });

  it('lets a pick made while the foreground answer was loading win over that answer', async () => {
    await mount();
    await waitFor(() => expect(mockShared.fetchAccountTheme).toHaveBeenCalledTimes(1));
    let resolve!: (t: string) => void;
    mockShared.fetchAccountTheme.mockReturnValue(new Promise<string>(r => { resolve = r; }));
    await toForeground();
    await act(async () => { current!.setMode('light'); });
    await act(async () => { resolve('dark'); });
    expect(current!.mode).toBe('light');
  });

  it('keeps a pick the account rejected, and tries to send it again, instead of taking the stale account value', async () => {
    mockShared.saveAccountTheme.mockRejectedValue(new Error('function not found'));
    await mount();
    await waitFor(() => expect(mockShared.fetchAccountTheme).toHaveBeenCalledTimes(1));
    await act(async () => { current!.setMode('light'); });
    await waitFor(async () => expect(await AsyncStorage.getItem('eiyu:theme-unsynced')).toBe('u1'));
    mockShared.saveAccountTheme.mockClear();
    mockShared.fetchAccountTheme.mockResolvedValue('dark');
    await toForeground();
    await waitFor(() => expect(mockShared.saveAccountTheme).toHaveBeenCalledWith('light'));
    expect(current!.mode).toBe('light');
  });

  it('stops listening when the provider goes away', async () => {
    const view = await render(<AppThemeProvider><Probe /></AppThemeProvider>);
    await waitFor(() => expect(appStateHandlers.length).toBeGreaterThan(0));
    await act(async () => { view.unmount(); });
    expect(appStateRemove).toHaveBeenCalled();
  });

  it('does not listen while signed out', async () => {
    mockUserId = undefined;
    await mount();
    expect(appStateHandlers).toHaveLength(0);
  });
});

describe('AppThemeProvider tokens', () => {
  it('exposes the palette tokens for the current mode and palette', async () => {
    await mount();
    expect(current!.tokens).toEqual(PALETTE_TOKENS.cyan.dark);
    expect(current!.tokens.accent).toBe(PALETTE_TOKENS.cyan.dark.accent);
  });

  it('follows a palette and mode change', async () => {
    await mount();
    await act(async () => { current!.setPalette('magenta'); });
    await act(async () => { current!.setMode('light'); });
    expect(current!.tokens.accent).toBe(PALETTE_TOKENS.magenta.light.accent);
    expect(current!.tokens['page-flat']).toBe(PALETTE_TOKENS.magenta.light['page-flat']);
  });

  it('useTokens returns the same object as the provider value', async () => {
    await mount();
    expect(currentTokens).toBe(current!.tokens);
  });
});
