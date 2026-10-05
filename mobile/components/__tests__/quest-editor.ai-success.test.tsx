import { cleanup, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';

import { makeEditorStore } from '../../test-support/quest-editor-kit';
import { renderWithTheme } from '../ui/test-theme';

const mockSuggestEasyVersions = jest.fn();
jest.doMock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  suggestEasyVersions: mockSuggestEasyVersions,
}));

let mockParams: { id?: string; type?: string } = {};
const mockStore = makeEditorStore();

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }),
}));
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStore }));
jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  const { View } = require('react-native');
  const passthrough = ({ children, ...props }: any) => React.createElement(View, props, children);
  return { KeyboardAwareScrollView: passthrough, KeyboardAvoidingView: passthrough };
});

const { default: QuestEditorScreen } = require('../../app/quest-editor') as typeof import('../../app/quest-editor');

describe('mobile Quest Editor AI success', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
    mockParams = {};
  });

  it('renders three editable penalty choices from a successful AI response', async () => {
    mockParams = { type: 'habit' };
    mockSuggestEasyVersions.mockResolvedValue(['Read one page', 'Open the book', 'Review one note']);
    await renderWithTheme(<QuestEditorScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Code for 2 hours'), 'Read every day');
    await waitFor(() => expect(screen.getByPlaceholderText('e.g. Code for 2 hours').props.value).toBe('Read every day'));
    await userEvent.setup().press(screen.getByRole('button', { name: 'SUGGEST PENALTIES' }));
    await waitFor(() => expect(mockSuggestEasyVersions).toHaveBeenCalledWith('Read every day', expect.any(String)));

    const expected = ['Read one page', 'Open the book', 'Review one note'];
    for (const [index, suggestion] of expected.entries()) {
      const chip = await screen.findByTestId(`quest-ai-suggestion-${index + 1}`);
      expect(chip.props.accessibilityLabel).toBe(suggestion);
      expect(chip).toBeOnTheScreen();
    }
  });

  it('picking a suggestion fills the penalty and clears the list', async () => {
    mockParams = { type: 'habit' };
    mockSuggestEasyVersions.mockResolvedValue(['Read one page', 'Open the book', 'Review one note']);
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await fireEvent.changeText(screen.getByLabelText('Quest name'), 'Read every day');
    await user.press(screen.getByRole('button', { name: 'SUGGEST PENALTIES' }));
    await user.press(await screen.findByTestId('quest-ai-suggestion-2'));

    expect(screen.getByPlaceholderText('e.g. Code for 20 minutes').props.value).toBe('Open the book');
    expect(screen.queryByTestId('quest-ai-suggestion-1')).toBeNull();
  });

  it('keeps the suggest button off until the quest has a name, and reports a failed suggestion', async () => {
    mockParams = { type: 'habit' };
    mockSuggestEasyVersions.mockRejectedValue(new Error('AI is down'));
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.getByRole('button', { name: 'SUGGEST PENALTIES' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Quest name'), 'Read every day');
    await user.press(screen.getByRole('button', { name: 'SUGGEST PENALTIES' }));
    expect(await screen.findByText(/AI is down/)).toBeOnTheScreen();
    expect(screen.queryByTestId('quest-ai-suggestion-1')).toBeNull();
  });
});
