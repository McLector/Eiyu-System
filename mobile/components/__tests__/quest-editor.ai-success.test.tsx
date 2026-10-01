import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { initialUser } from '@eiyu/shared';

const mockSuggestEasyVersions = jest.fn();
jest.doMock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  suggestEasyVersions: mockSuggestEasyVersions,
}));

let mockParams: { id?: string; type?: string } = {};
const mockStore: any = {
  theme: {
    overlay: '#000', modal: '#111', glassBorder: '#333', handle: '#444', text: '#fff', dim: '#999',
    track: '#222', accentBorder: '#555', accent: '#0ff', muted: '#aaa', accentStrong: '#0ff', accentGlass: '#022',
  },
  user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests: [], longQuests: [] },
  saveHabit: jest.fn().mockResolvedValue(undefined),
  archiveQuest: jest.fn().mockResolvedValue(undefined),
  restoreQuest: jest.fn().mockResolvedValue(undefined),
  deleteQuest: jest.fn().mockResolvedValue(undefined),
};

jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => mockParams }));
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStore }));
jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { KeyboardAwareScrollView: ({ children, ...props }: any) => React.createElement(View, props, children) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('@/components/eiyu/screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Screen: ({ children, ...props }: any) => React.createElement(View, props, children) };
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
    await render(<QuestEditorScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Code for 2 hours'), 'Read every day');
    await waitFor(() => expect(screen.getByPlaceholderText('e.g. Code for 2 hours').props.value).toBe('Read every day'));
    await fireEvent.press(screen.getByText('✨ SUGGEST PENALTIES').parent!);
    await waitFor(() => expect(mockSuggestEasyVersions).toHaveBeenCalledWith('Read every day', expect.any(String)));

    const expected = ['Read one page', 'Open the book', 'Review one note'];
    for (const [index, suggestion] of expected.entries()) {
      const chip = await screen.findByTestId(`quest-ai-suggestion-${index + 1}`);
      expect(chip.props.accessibilityLabel).toBe(suggestion);
      expect(chip).toBeOnTheScreen();
    }
  });
});
