import { act, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { Text as RNText, type StyleProp, type TextStyle } from 'react-native';

import { FontScaleNudgeProvider } from '@/contexts/font-scale-nudge';
import { AppText } from '../app-text';

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

describe('AppText', () => {
  it('renders the exact same style as a plain Text at mount (no patch)', async () => {
    const style: StyleProp<TextStyle> = [{ fontSize: 14, letterSpacing: 1.2 }, [{ color: 'red' }, false, null]];
    await render(wrap(<><AppText testID="a" style={style}>x</AppText><RNText testID="b" style={style}>x</RNText></>));
    expect(screen.getByTestId('a').props.style).toEqual(screen.getByTestId('b').props.style);
  });

  it('works with no provider and never patches', async () => {
    await render(<AppText testID="a" style={{ fontSize: 14 }}>x</AppText>);
    mockScale = 1.6;
    await act(async () => { await screen.rerender(<AppText testID="a" style={{ fontSize: 14 }}>x</AppText>); });
    expect(screen.getByTestId('a')).not.toHaveStyle({ letterSpacing: expect.anything() });
  });

  it('adds a tiny letterSpacing after a scale change and alternates', async () => {
    const ui = <AppText style={{ fontSize: 14 }}>hello</AppText>;
    await render(wrap(ui));
    expect(screen.getByText('hello')).not.toHaveStyle({ letterSpacing: expect.anything() });
    await change(1.6, ui);
    expect(screen.getByText('hello')).toHaveStyle({ letterSpacing: 0.01, fontSize: 14 });
    await change(1, ui);
    expect(screen.getByText('hello')).toHaveStyle({ letterSpacing: 0.02 });
    await change(1.6, ui);
    expect(screen.getByText('hello')).toHaveStyle({ letterSpacing: 0.01 });
  });

  it('adds to an existing letterSpacing, including one inside nested style arrays', async () => {
    const ui = <AppText style={[{ letterSpacing: 9 }, [[{ letterSpacing: 1.2 }]], undefined]}>hello</AppText>;
    await render(wrap(ui));
    expect(screen.getByText('hello')).toHaveStyle({ letterSpacing: 1.2 });
    await change(1.6, ui);
    expect(screen.getByText('hello')).toHaveStyle({ letterSpacing: 1.21 });
  });

  it('handles an absent style', async () => {
    await render(wrap(<AppText>plain</AppText>));
    await change(1.6, <AppText>plain</AppText>);
    expect(screen.getByText('plain')).toHaveStyle({ letterSpacing: 0.01 });
  });

  it('nested AppText inherits the parent tracking unless it sets its own', async () => {
    const ui = (
      <AppText style={{ letterSpacing: 1.2 }}>
        outer <AppText testID="inherit">in</AppText> <AppText testID="own" style={{ letterSpacing: 2 }}>own</AppText>
      </AppText>
    );
    await render(wrap(ui));
    await change(1.6, ui);
    expect(screen.getByTestId('inherit')).not.toHaveStyle({ letterSpacing: expect.anything() });
    expect(screen.getByTestId('own')).toHaveStyle({ letterSpacing: 2.01 });
  });

  it('passes props, accessibility and the ref through, and never disables scaling', async () => {
    const ref = createRef<RNText>();
    const onPress = jest.fn();
    await render(wrap(
      <AppText ref={ref} testID="t" numberOfLines={2} accessibilityRole="header" accessibilityLabel="Title" onPress={onPress}>x</AppText>,
    ));
    await change(1.6, <AppText ref={ref} testID="t" numberOfLines={2} accessibilityRole="header" accessibilityLabel="Title" onPress={onPress}>x</AppText>);
    const node = screen.getByTestId('t');
    expect(node).toHaveProp('numberOfLines', 2);
    expect(node).toHaveProp('accessibilityRole', 'header');
    expect(node).toHaveProp('accessibilityLabel', 'Title');
    expect(node.props.allowFontScaling).not.toBe(false);
    expect(node.props.maxFontSizeMultiplier).toBeUndefined();
    expect(ref.current).toBeTruthy();
  });
});
