import { screen } from '@testing-library/react-native';
import { PALETTE_TOKENS } from '@eiyu/shared';
import { StyleSheet } from 'react-native';
import { withRepeat } from 'react-native-reanimated';

import { FireStreak } from '../fire-streak';
import { renderWithTheme } from '../test-theme';
import { useReducedMotion } from '../use-reduced-motion';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, withRepeat: jest.fn(actual.withRepeat) };
});
jest.mock('../use-reduced-motion', () => ({ useReducedMotion: jest.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = PALETTE_TOKENS.cyan.dark;
// react-native-svg hands child colours to the native side as 0xAARRGGBB integers.
const argb = (hex: string) => (0xff000000 | parseInt(hex.slice(1), 16)) >>> 0;
const tree = () => JSON.stringify(screen.toJSON());
const root = () => screen.getByTestId('fire-streak', { includeHiddenElements: true });

beforeEach(() => {
  (withRepeat as jest.Mock).mockClear();
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});

describe('FireStreak', () => {
  it('draws three flame layers in the fire colours, which stay the same in every palette', async () => {
    await renderWithTheme(<FireStreak />, { palette: 'violet' });
    for (const token of ['fire-outer', 'fire-inner', 'fire-core']) expect(tree()).toContain(`"payload":${argb(PALETTE_TOKENS.violet.dark[token])}`);
    expect(PALETTE_TOKENS.violet.dark['fire-outer']).toBe(T['fire-outer']);
  });

  it('is sized like the web flame: height is size times 30/26', async () => {
    await renderWithTheme(<FireStreak size={26} />);
    expect(StyleSheet.flatten(root().props.style)).toMatchObject({ width: 26, height: 30 });
  });

  it('defaults to 14 wide', async () => {
    await renderWithTheme(<FireStreak />);
    expect(StyleSheet.flatten(root().props.style).width).toBe(14);
  });

  it('is decoration: hidden from screen readers', async () => {
    await renderWithTheme(<FireStreak />);
    expect(screen.queryByTestId('fire-streak')).toBeNull();
    expect(root()).toHaveProp('accessibilityElementsHidden', true);
    expect(root()).toHaveProp('importantForAccessibility', 'no-hide-descendants');
  });

  it('flickers: every layer repeats forever, on its own rhythm', async () => {
    await renderWithTheme(<FireStreak />);
    expect(withRepeat).toHaveBeenCalledTimes(3);
    for (const call of (withRepeat as jest.Mock).mock.calls) expect(call[1]).toBe(-1);
  });

  it('holds still when the phone asks for reduced motion: no animation is started at all', async () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    await renderWithTheme(<FireStreak />);
    expect(withRepeat).not.toHaveBeenCalled();
    expect(tree()).toContain(`"payload":${argb(T['fire-outer'])}`);
  });
});
