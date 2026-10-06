import { act, screen, userEvent } from '@testing-library/react-native';
import { PALETTE_TOKENS } from '@eiyu/shared';
import { Dimensions, StyleSheet, Text } from 'react-native';

import { Sheet } from '../sheet';
import { renderWithTheme } from '../test-theme';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('react-native-keyboard-controller', () => ({
  // A stand-in that marks itself, so a test can tell it from the plain ScrollView.
  KeyboardAwareScrollView: function KeyboardAwareScrollView({ children, ...props }: { children: unknown }) {
    const { ScrollView } = jest.requireActual('react-native');
    return <ScrollView {...props} {...({ keyboardAware: true } as object)}>{children as never}</ScrollView>;
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = PALETTE_TOKENS.cyan.dark;
const back = async () => { await act(async () => { screen.getByTestId('sheet').props.onRequestClose(); }); };

describe('Sheet', () => {
  it('shows its title, content and footer while visible', async () => {
    await renderWithTheme(
      <Sheet visible title="Quest details" onClose={() => {}} footer={<Text>Footer</Text>}>
        <Text>Body</Text>
      </Sheet>,
    );
    expect(screen.getByText('Quest details')).toBeOnTheScreen();
    expect(screen.getByText('Body')).toBeOnTheScreen();
    expect(screen.getByText('Footer')).toBeOnTheScreen();
  });

  it('draws behind the navigation bar, so the bottom inset it adds is not counted twice', async () => {
    await renderWithTheme(<Sheet visible onClose={() => {}} title="T"><Text>x</Text></Sheet>);
    expect(screen.getByTestId('sheet')).toHaveProp('navigationBarTranslucent', true);
    expect(screen.getByTestId('sheet')).toHaveProp('statusBarTranslucent', true);
  });

  it('shows nothing while hidden', async () => {
    await renderWithTheme(<Sheet visible={false} title="Quest details" onClose={() => {}}><Text>Body</Text></Sheet>);
    expect(screen.queryByText('Quest details')).toBeNull();
    expect(screen.queryByText('Body')).toBeNull();
  });

  it('closes once from the Close button', async () => {
    const onClose = jest.fn();
    await renderWithTheme(<Sheet visible title="T" onClose={onClose}><Text>Body</Text></Sheet>);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes once from a tap on the dimmed area behind it', async () => {
    const onClose = jest.fn();
    await renderWithTheme(<Sheet visible title="T" onClose={onClose}><Text>Body</Text></Sheet>);
    await userEvent.setup().press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes once from the Android back button', async () => {
    const onClose = jest.fn();
    await renderWithTheme(<Sheet visible title="T" onClose={onClose}><Text>Body</Text></Sheet>);
    await back();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('can be made to ignore back and the backdrop, and then has no Close button', async () => {
    const onClose = jest.fn();
    await renderWithTheme(<Sheet visible title="Saving" dismissible={false} onClose={onClose}><Text>Body</Text></Sheet>);
    await userEvent.setup().press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));
    await back();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('scrolls its content instead of clipping it, and never grows past 90% of the screen', async () => {
    await renderWithTheme(<Sheet visible title="T" onClose={() => {}}><Text>Body</Text></Sheet>);
    expect(screen.getByTestId('sheet-panel')).toHaveStyle({ maxHeight: Dimensions.get('window').height * 0.9 });
    const scroller = screen.getByTestId('sheet-scroll');
    expect(scroller).toHaveProp('keyboardShouldPersistTaps', 'handled');
    expect(StyleSheet.flatten(scroller.props.style).flexShrink).toBe(1);
  });

  it('is announced as a modal and keeps clear of the system navigation bar', async () => {
    await renderWithTheme(<Sheet visible title="T" onClose={() => {}} footer={<Text>Footer</Text>}><Text>Body</Text></Sheet>);
    expect(screen.getByTestId('sheet-panel')).toHaveProp('accessibilityViewIsModal', true);
    expect(StyleSheet.flatten(screen.getByTestId('sheet-footer').props.style).paddingBottom).toBeGreaterThanOrEqual(16);
  });

  it('titles itself for screen readers as a heading', async () => {
    await renderWithTheme(<Sheet visible title="Quest details" onClose={() => {}}><Text>Body</Text></Sheet>);
    expect(screen.getByRole('header', { name: 'Quest details' })).toBeOnTheScreen();
  });

  it('draws the palette: modal colour panel over the dim backdrop', async () => {
    await renderWithTheme(<Sheet visible title="T" onClose={() => {}}><Text>Body</Text></Sheet>);
    expect(screen.getByTestId('sheet-panel')).toHaveStyle({ backgroundColor: T.modal });
    expect(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true })).toHaveStyle({ backgroundColor: T.overlay });
  });

  it('closes by a tap on its Close button even with no title', async () => {
    const onClose = jest.fn();
    await renderWithTheme(<Sheet visible onClose={onClose}><Text>Body</Text></Sheet>);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the Close button at least 48dp square', async () => {
    await renderWithTheme(<Sheet visible title="T" onClose={() => {}}><Text>Body</Text></Sheet>);
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Close' }).props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
  });

  it('lets the Close button carry a longer name for screen readers and tests', async () => {
    const onClose = jest.fn();
    await renderWithTheme(<Sheet visible title="Edit details" closeLabel="Close Edit details" onClose={onClose}><Text>Body</Text></Sheet>);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close Edit details' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('scrolls with the plain ScrollView by default', async () => {
    await renderWithTheme(<Sheet visible title="T" onClose={() => {}}><Text>Body</Text></Sheet>);
    expect(screen.getByTestId('sheet-scroll')).not.toHaveProp('keyboardAware');
  });

  it('can lift its fields above the keyboard when asked', async () => {
    await renderWithTheme(<Sheet visible title="T" keyboardAware onClose={() => {}}><Text>Body</Text></Sheet>);
    expect(screen.getByTestId('sheet-scroll')).toHaveProp('keyboardAware', true);
    expect(screen.getByTestId('sheet-scroll')).toHaveProp('keyboardShouldPersistTaps', 'handled');
  });
});
