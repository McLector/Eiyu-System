import { PALETTE_TOKENS } from '@eiyu/shared';

import TabLayout from '../../app/(tabs)/_layout';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Captured { screenOptions?: Record<string, unknown>; screens: { name: string; options: Record<string, unknown> }[] }
const mockCaptured: Captured = { screens: [] };
let mockFontScale = 1;

jest.mock('expo-router', () => {
  function Tabs({ children, screenOptions }: { children: unknown; screenOptions: Record<string, unknown> }) {
    mockCaptured.screenOptions = screenOptions;
    const { View: MockView } = jest.requireActual('react-native');
    return <MockView>{children as never}</MockView>;
  }
  Tabs.Screen = function Screen({ name, options }: { name: string; options: Record<string, unknown> }) {
    mockCaptured.screens.push({ name, options });
    return null;
  };
  return { Tabs };
});
jest.mock('@/components/eiyu/account-header', () => ({ __esModule: true, default: () => null }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 800, scale: 2, fontScale: mockFontScale }),
}));

const T = PALETTE_TOKENS.cyan.dark;

beforeEach(() => {
  mockCaptured.screens = [];
  mockCaptured.screenOptions = undefined;
  mockFontScale = 1;
});

describe('tab layout', () => {
  it('has Board, Status and Chain, in that order, and no old Long Quests route', async () => {
    await renderWithTheme(<TabLayout />);
    expect(mockCaptured.screens.map(s => s.name)).toEqual(['board', 'status', 'chain']);
    expect(mockCaptured.screens.map(s => s.options.title)).toEqual(['BOARD', 'STATUS', 'CHAIN']);
  });

  it('draws a flat bar from the palette: no blur layer, solid navigation colours', async () => {
    await renderWithTheme(<TabLayout />);
    const options = mockCaptured.screenOptions as Record<string, unknown> & { tabBarStyle: Record<string, unknown> };
    expect(options.tabBarBackground).toBeUndefined();
    expect(options.tabBarStyle).toMatchObject({ backgroundColor: T.nav, borderTopColor: T['nav-border'] });
    expect(options.tabBarActiveTintColor).toBe(T.accent);
    expect(options.tabBarInactiveTintColor).toBe(T['nav-dim']);
  });

  it('follows the palette and theme', async () => {
    await renderWithTheme(<TabLayout />, { palette: 'jade', mode: 'light' });
    const options = mockCaptured.screenOptions as Record<string, unknown> & { tabBarStyle: Record<string, unknown> };
    expect(options.tabBarStyle.backgroundColor).toBe(PALETTE_TOKENS.jade.light.nav);
    expect(options.tabBarActiveTintColor).toBe(PALETTE_TOKENS.jade.light.accent);
  });

  it('floats over the content at normal font size', async () => {
    await renderWithTheme(<TabLayout />);
    expect((mockCaptured.screenOptions as { tabBarStyle: Record<string, unknown> }).tabBarStyle.position).toBe('absolute');
  });

  it('takes its own room and grows when the system font is scaled up, so labels are not clipped', async () => {
    mockFontScale = 2;
    await renderWithTheme(<TabLayout />);
    const style = (mockCaptured.screenOptions as { tabBarStyle: Record<string, unknown> }).tabBarStyle;
    expect(style.position).toBe('relative');
    expect(style.height as number).toBeGreaterThan(73);
  });

  it('keeps the account header as the header of every tab', async () => {
    await renderWithTheme(<TabLayout />);
    const options = mockCaptured.screenOptions as { headerShown: boolean; header: () => unknown };
    expect(options.headerShown).toBe(true);
    expect(typeof options.header).toBe('function');
  });

  it('gives each tab an icon', async () => {
    await renderWithTheme(<TabLayout />);
    for (const screen of mockCaptured.screens) {
      const icon = (screen.options.tabBarIcon as (p: { color: string }) => unknown)({ color: '#123456' });
      expect(icon).toBeTruthy();
    }
  });
});
