import { cleanup, screen, userEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { habitQuest as quest, makeEditorStore } from '../../test-support/quest-editor-kit';
import { renderWithTheme } from '../ui/test-theme';

let mockSearchParams: { id?: string } = {};
let mockStoreValue: any;

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => mockSearchParams,
  useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }),
}));
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStoreValue }));
jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  const { View } = require('react-native');
  const passthrough = ({ children, ...props }: any) => React.createElement(View, props, children);
  return { KeyboardAwareScrollView: passthrough, KeyboardAvoidingView: passthrough };
});

import QuestEditorScreen from '../../app/quest-editor';

const mockRouter = jest.requireMock('expo-router').router as { back: jest.Mock };

function setup() {
  mockSearchParams = { id: quest.id };
  mockStoreValue = makeEditorStore([quest]);
}

describe('QuestEditor accessibility semantics', () => {
  afterEach(() => {
    cleanup();
    mockSearchParams = {};
    mockStoreValue = undefined;
    jest.clearAllMocks();
  });

  it('names all day checkboxes and reports only the tapped day as changed', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);

    expect(screen.getByRole('checkbox', { name: 'Sunday' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Saturday' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Tuesday' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Thursday' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByText('Su')).toBeOnTheScreen();
    expect(screen.getByText('Mo')).toBeOnTheScreen();
    await user.press(screen.getByRole('checkbox', { name: 'Sunday' }));
    expect(screen.getByRole('checkbox', { name: 'Sunday' }).props.accessibilityState.checked).toBe(false);
    expect(screen.getByRole('checkbox', { name: 'Saturday' }).props.accessibilityState.checked).toBe(true);
  });

  it('exposes named radio choices and keeps one selected value in each group', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    const stats = ['STR', 'INT', 'DEX', 'WIS', 'CHA'];
    const difficulties = ['Easy', 'Medium', 'Hard'];

    for (const name of stats) expect(screen.getByRole('radio', { name }).props.accessibilityState.checked).toBe(name === 'STR');
    for (const name of difficulties) expect(screen.getByRole('radio', { name }).props.accessibilityState.checked).toBe(name === 'Medium');
    await user.press(screen.getByRole('radio', { name: 'INT' }));
    await user.press(screen.getByRole('radio', { name: 'Hard' }));
    expect(stats.filter(name => screen.getByRole('radio', { name }).props.accessibilityState.selected)).toEqual(['INT']);
    expect(difficulties.filter(name => screen.getByRole('radio', { name }).props.accessibilityState.selected)).toEqual(['Hard']);
  });

  it('labels the 48 dp close button and preserves delete-confirmation guards', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    const close = screen.getByRole('button', { name: 'Close quest editor' });
    expect(StyleSheet.flatten(close.props.style)).toMatchObject({ minWidth: 48, minHeight: 48 });
    await user.press(close);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);

    mockRouter.back.mockClear();
    await user.press(screen.getByRole('button', { name: 'DELETE PERMANENTLY' }));
    await user.press(screen.getByRole('button', { name: 'Close quest editor' }));
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(screen.getByTestId('quest-delete-modal')).toBeOnTheScreen();
  });
});
