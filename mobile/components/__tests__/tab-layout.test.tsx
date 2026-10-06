import { PALETTE_TOKENS } from '@eiyu/shared';

import TabLayout from '../../app/(tabs)/_layout';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Captured { screenOptions?: Record<string, unknown>; screens: { name: string; options: Record<string, unknown> }[] }
const mockCaptured: Captured = { screens: [] };
let mockFontScale = 1;
let mockInsetBottom = 24;

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
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: mockInsetBottom, left: 0, right: 0 }),
}));
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
  mockInsetBottom = 24;
});

describe('tab layout', () => {
  it('has Board, Status, Chain and Gym, in that order, and no old Long Quests route', async () => {
    await renderWithTheme(<TabLayout />);
    expect(mockCaptured.screens.map(s => s.name)).toEqual(['board', 'status', 'chain', 'gym']);
    expect(mockCaptured.screens.map(s => s.options.title)).toEqual(['BOARD', 'STATUS', 'CHAIN', 'GYM']);
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

  const barStyle = () => (mockCaptured.screenOptions as { tabBarStyle: Record<string, number | string> }).tabBarStyle;

  it('is part of the layout at every font size, so no screen has to guess how much it covers', async () => {
    for (const scale of [1, 1.15, 1.3, 2]) {
      mockFontScale = scale;
      await renderWithTheme(<TabLayout />);
      expect(barStyle().position).not.toBe('absolute');
    }
  });

  it('adds the system navigation bar inset to its height: 3-button navigation gets more room than gestures', async () => {
    mockInsetBottom = 24;
    await renderWithTheme(<TabLayout />);
    const gesture = barStyle().height as number;
    mockInsetBottom = 48;
    await renderWithTheme(<TabLayout />);
    const threeButton = barStyle().height as number;
    expect(threeButton - gesture).toBe(24);
    expect(barStyle().paddingBottom as number).toBeGreaterThanOrEqual(48);
  });

  it('has no inset to add when the device reports none', async () => {
    mockInsetBottom = 0;
    await renderWithTheme(<TabLayout />);
    expect(barStyle().height as number).toBeGreaterThan(0);
    expect(barStyle().paddingBottom as number).toBeGreaterThanOrEqual(0);
  });

  it('grows with the system font scale and still includes the inset', async () => {
    mockInsetBottom = 48;
    mockFontScale = 1;
    await renderWithTheme(<TabLayout />);
    const normal = barStyle().height as number;
    mockFontScale = 2;
    await renderWithTheme(<TabLayout />);
    expect(barStyle().height as number).toBeGreaterThan(normal);
    expect(barStyle().paddingBottom as number).toBeGreaterThanOrEqual(48);
  });

  it('caps label scaling so a huge font cannot push the labels out of the bar', async () => {
    mockFontScale = 2;
    await renderWithTheme(<TabLayout />);
    expect((mockCaptured.screenOptions as { tabBarAllowFontScaling?: boolean }).tabBarAllowFontScaling).toBe(false);
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
