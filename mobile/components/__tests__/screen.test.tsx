import { render, screen as rendered } from '@testing-library/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/eiyu/screen';

let mockScroll: { style?: unknown; contentContainerStyle?: unknown } = {};
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}));
jest.mock('react-native-keyboard-controller', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    KeyboardAwareScrollView: (props: { style?: unknown; contentContainerStyle?: unknown; children?: unknown }) => {
      mockScroll = props;
      return <MockView>{props.children as never}</MockView>;
    },
  };
});

const viewport = () => StyleSheet.flatten(mockScroll.style as never) as Record<string, unknown>;
const content = () => StyleSheet.flatten(mockScroll.contentContainerStyle as never) as Record<string, unknown>;

describe('Screen status bar handling', () => {
  it('starts a scrolling screen below the status bar, so text cannot scroll under it', async () => {
    await render(<Screen edges={['top', 'bottom']} contentContainerStyle={{ paddingVertical: 32 }}><Text>Body</Text></Screen>);
    expect(viewport().marginTop).toBe(40);
    expect(content().paddingTop).toBe(32);
  });

  it('keeps the bottom inset inside the scrolling content', async () => {
    await render(<Screen edges={['top', 'bottom']} contentContainerStyle={{ paddingVertical: 32 }}><Text>Body</Text></Screen>);
    expect(content().paddingBottom).toBe(52);
  });

  it('still adds the top gap inside the content', async () => {
    await render(<Screen topGap={8}><Text>Body</Text></Screen>);
    expect(viewport().marginTop).toBe(40);
    expect(content().paddingTop).toBe(8);
  });

  it('leaves the top alone when the screen does not ask for it', async () => {
    await render(<Screen edges={[]}><Text>Body</Text></Screen>);
    expect(viewport().marginTop).toBeUndefined();
    expect(content().paddingTop).toBeUndefined();
  });

  it('keeps a caller style on the scrolling view', async () => {
    await render(<Screen style={{ opacity: 0.5 }}><Text>Body</Text></Screen>);
    expect(viewport()).toMatchObject({ opacity: 0.5, marginTop: 40, flex: 1 });
  });

  it('pads a screen that does not scroll', async () => {
    await render(<Screen scroll={false} style={{ paddingTop: 4 }}><View testID="inner" /></Screen>);
    const outer = StyleSheet.flatten(rendered.getByTestId('inner').parent?.props.style) as Record<string, unknown>;
    expect(outer.paddingTop).toBe(44);
  });
});
