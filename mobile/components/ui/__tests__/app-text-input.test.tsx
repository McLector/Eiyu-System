import { act, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { TextInput } from 'react-native';

import { FontScaleNudgeProvider } from '@/contexts/font-scale-nudge';
import { AppTextInput } from '../app-text-input';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 800, scale: 3, fontScale: mockScale }),
}));
beforeEach(() => { mockScale = 1; });

const wrap = (children: React.ReactNode) => <FontScaleNudgeProvider>{children}</FontScaleNudgeProvider>;
const change = async (next: number, children: React.ReactNode) => {
  mockScale = next;
  await act(async () => { await screen.rerender(wrap(children)); });
};

describe('AppTextInput', () => {
  it('passes its style through untouched at mount', async () => {
    const style = { fontSize: 18, color: 'red' };
    await render(wrap(<AppTextInput testID="a" style={style} />));
    expect(screen.getByTestId('a').props.style).toEqual(style);
  });
  it('works with no provider and never patches', async () => {
    await render(<AppTextInput testID="a" style={{ fontSize: 18 }} />);
    expect(screen.getByTestId('a')).not.toHaveStyle({ letterSpacing: expect.anything() });
  });
  it('adds the font-scale nudge after the system font size changes, so Android measures it again', async () => {
    const ui = <AppTextInput testID="a" style={{ fontSize: 18 }} />;
    await render(wrap(ui));
    await change(1.6, ui);
    expect(screen.getByTestId('a')).toHaveStyle({ letterSpacing: expect.any(Number) });
  });
  it('adds the nudge on top of the tracking already in its style', async () => {
    const ui = <AppTextInput testID="a" style={{ letterSpacing: 2 }} />;
    await render(wrap(ui));
    await change(1.6, ui);
    const spacing = (screen.getByTestId('a').props.style as { letterSpacing: number }[])[1].letterSpacing;
    expect(spacing).toBeGreaterThan(2);
    expect(spacing).toBeLessThan(2.1);
  });
  it('forwards its ref and every other prop', async () => {
    const ref = createRef<TextInput>();
    const onChangeText = jest.fn();
    await render(<AppTextInput ref={ref} testID="a" value="12" keyboardType="decimal-pad" editable={false} onChangeText={onChangeText} />);
    expect(ref.current).toBeTruthy();
    const input = screen.getByTestId('a');
    expect(input.props.value).toBe('12');
    expect(input.props.keyboardType).toBe('decimal-pad');
    expect(input.props.editable).toBe(false);
  });
});
