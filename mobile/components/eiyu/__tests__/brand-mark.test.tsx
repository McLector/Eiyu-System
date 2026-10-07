import { screen } from '@testing-library/react-native';
import { PALETTE_TOKENS } from '@eiyu/shared';
import { StyleSheet } from 'react-native';
import { cancelAnimation, withRepeat, withTiming } from 'react-native-reanimated';

import { BrandMark } from '../brand-mark';
import { renderWithTheme, TestThemeProvider } from '../../ui/test-theme';
import { useReducedMotion } from '../../ui/use-reduced-motion';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    __esModule: true,
    ...actual,
    withRepeat: jest.fn(actual.withRepeat),
    withTiming: jest.fn(actual.withTiming),
    cancelAnimation: jest.fn(actual.cancelAnimation),
  };
});
jest.mock('../../ui/use-reduced-motion', () => ({ useReducedMotion: jest.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MARK_STYLE = {
  color: '#123456',
  fontFamily: 'Test-Display',
  fontSize: 17,
  borderWidth: 1.5,
  borderColor: '#abcdef',
  backgroundColor: '#fedcba',
};
const mark = () => screen.getByTestId('brand-mark');
const glow = () => screen.getByTestId('brand-mark-glow', { includeHiddenElements: true });
const tree = () => JSON.stringify(screen.toJSON());
const HALF_CYCLE = { duration: 1400, easing: expect.any(Function) };

beforeEach(() => {
  (withRepeat as jest.Mock).mockClear();
  (withTiming as jest.Mock).mockClear();
  (cancelAnimation as jest.Mock).mockClear();
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});

describe('BrandMark', () => {
  it('renders the glyph as the mark itself, in the style it is given', async () => {
    await renderWithTheme(<BrandMark testID="brand-mark" style={MARK_STYLE}>英</BrandMark>);
    expect(mark()).toHaveTextContent('英');
    expect(StyleSheet.flatten(mark().props.style)).toMatchObject(MARK_STYLE);
    expect(mark()).not.toHaveProp('accessibilityElementsHidden', true);
  });

  it('draws the duplicate glyph underneath the mark, so the crisp mark stays on top', async () => {
    await renderWithTheme(<BrandMark testID="brand-mark" style={MARK_STYLE}>英</BrandMark>);
    expect(glow()).toHaveTextContent('英');
    expect(tree().indexOf('"testID":"brand-mark-glow"')).toBeLessThan(tree().indexOf('"testID":"brand-mark"'));
  });

  it('keeps the duplicate out of the accessibility tree and off the touch path', async () => {
    await renderWithTheme(<BrandMark testID="brand-mark" style={MARK_STYLE}>英</BrandMark>);
    expect(glow()).toHaveProp('accessibilityElementsHidden', true);
    expect(glow()).toHaveProp('importantForAccessibility', 'no-hide-descendants');
    expect(glow()).toHaveProp('pointerEvents', 'none');
    expect(screen.getByText('英').props.testID).toBe('brand-mark');
  });

  it('gives the duplicate the mark colour, font and size, and no border or fill of its own', async () => {
    await renderWithTheme(<BrandMark testID="brand-mark" style={MARK_STYLE}>英</BrandMark>);
    expect(StyleSheet.flatten(glow().props.style)).toMatchObject({
      position: 'absolute',
      color: MARK_STYLE.color,
      fontFamily: MARK_STYLE.fontFamily,
      fontSize: MARK_STYLE.fontSize,
      borderWidth: MARK_STYLE.borderWidth,
      borderColor: 'transparent',
      backgroundColor: 'transparent',
    });
  });

  it.each([
    ['cyan', 'dark'],
    ['violet', 'dark'],
    ['jade', 'light'],
  ] as const)('glows with the %s palette accent in %s mode', async (palette, mode) => {
    await renderWithTheme(<BrandMark testID="brand-mark" style={MARK_STYLE}>英</BrandMark>, { palette, mode });
    expect(StyleSheet.flatten(glow().props.style)).toMatchObject({
      textShadowColor: PALETTE_TOKENS[palette][mode].accent,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 10,
    });
  });

  it('pulses by default: a fade in and a fade out of 1.4 seconds each, repeated forever', async () => {
    await renderWithTheme(<BrandMark testID="brand-mark" style={MARK_STYLE}>英</BrandMark>);
    expect(withRepeat).toHaveBeenCalledTimes(1);
    expect(withRepeat).toHaveBeenCalledWith(expect.anything(), -1, false);
    expect((withTiming as jest.Mock).mock.calls).toEqual([[1, HALF_CYCLE], [0, HALF_CYCLE]]);
  });

  it('starts no animation and holds the glow at zero when the phone asks for reduced motion', async () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    await renderWithTheme(<BrandMark testID="brand-mark" style={MARK_STYLE}>英</BrandMark>);
    expect(withRepeat).not.toHaveBeenCalled();
    expect(withTiming).not.toHaveBeenCalled();
    expect(cancelAnimation).toHaveBeenCalled();
    expect(StyleSheet.flatten(glow().props.style)).toMatchObject({ opacity: 0 });
  });

  it('stops the pulse when reduced motion is switched on while the screen is open', async () => {
    const { rerender } = await renderWithTheme(<BrandMark testID="brand-mark" style={MARK_STYLE}>英</BrandMark>);
    expect(withRepeat).toHaveBeenCalledTimes(1);
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    await rerender(
      <TestThemeProvider>
        <BrandMark testID="brand-mark" style={MARK_STYLE}>英</BrandMark>
      </TestThemeProvider>,
    );
    expect(cancelAnimation).toHaveBeenCalled();
    expect(withRepeat).toHaveBeenCalledTimes(1);
  });
});
