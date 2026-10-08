import { screen } from '@testing-library/react-native';
import { PALETTE_TOKENS } from '@eiyu/shared';
import { StyleSheet } from 'react-native';
import { withRepeat } from 'react-native-reanimated';

import { FrostMark } from '../frost-mark';
import { renderWithTheme } from '../test-theme';
import { useReducedMotion } from '../use-reduced-motion';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, withRepeat: jest.fn(actual.withRepeat) };
});
jest.mock('../use-reduced-motion', () => ({ useReducedMotion: jest.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// react-native-svg hands child colours to the native side as 0xAARRGGBB integers.
const argb = (hex: string) => (0xff000000 | parseInt(hex.slice(1), 16)) >>> 0;
const tree = () => JSON.stringify(screen.toJSON());
const root = () => screen.getByTestId('frost-mark', { includeHiddenElements: true });

beforeEach(() => {
  (withRepeat as jest.Mock).mockClear();
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});

describe('FrostMark', () => {
  it('draws the snowflake in the palette ice colour, which differs between dark and light', async () => {
    await renderWithTheme(<FrostMark />, { mode: 'dark' });
    const dark = PALETTE_TOKENS.cyan.dark.ice;
    expect(tree()).toContain(`"payload":${argb(dark)}`);
    await renderWithTheme(<FrostMark />, { mode: 'light' });
    expect(PALETTE_TOKENS.cyan.light.ice).not.toBe(dark);
    expect(tree()).toContain(`"payload":${argb(PALETTE_TOKENS.cyan.light.ice)}`);
  });

  it('is a square box of the requested size (default 14), so the glint stays inside it', async () => {
    await renderWithTheme(<FrostMark />);
    expect(StyleSheet.flatten(root().props.style)).toMatchObject({ width: 14, height: 14 });
    await renderWithTheme(<FrostMark size={20} />);
    expect(StyleSheet.flatten(root().props.style)).toMatchObject({ width: 20, height: 20 });
  });

  it('is decoration: hidden from screen readers', async () => {
    await renderWithTheme(<FrostMark />);
    expect(screen.queryByTestId('frost-mark')).toBeNull();
    expect(root()).toHaveProp('accessibilityElementsHidden', true);
    expect(root()).toHaveProp('importantForAccessibility', 'no-hide-descendants');
  });

  it('shimmers and twinkles: two loops, both repeat forever', async () => {
    await renderWithTheme(<FrostMark />);
    expect(withRepeat).toHaveBeenCalledTimes(2);
    for (const call of (withRepeat as jest.Mock).mock.calls) expect(call[1]).toBe(-1);
    expect(screen.getByTestId('frost-glint', { includeHiddenElements: true })).toBeTruthy();
  });

  it('holds still when the phone asks for reduced motion: no loop starts and no glint is drawn, the flake still is', async () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    await renderWithTheme(<FrostMark />);
    expect(withRepeat).not.toHaveBeenCalled();
    expect(screen.queryByTestId('frost-glint', { includeHiddenElements: true })).toBeNull();
    expect(tree()).toContain(`"payload":${argb(PALETTE_TOKENS.cyan.dark.ice)}`);
  });
});
