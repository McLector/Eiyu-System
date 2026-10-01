import { cleanup, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { Quest, UserProfile } from '@eiyu/shared';
import { initialUser } from '@eiyu/shared';

const mockSuggestEasyVersions = jest.fn();
jest.doMock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  suggestEasyVersions: mockSuggestEasyVersions,
}));

let mockParams: { id?: string; type?: string } = {};
let mockStore: any;
const mockRouterBack = jest.fn();

jest.mock('expo-router', () => ({ router: { back: mockRouterBack }, useLocalSearchParams: () => mockParams }));
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

const existingQuest: Quest = {
  id: 'weekday', name: 'Legacy name', stat: 'INT', difficulty: 'Medium', easyVersion: 'One minute',
  description: null, questType: 'habit', archived: false, time: '08:00', days: [1, 3, 5], streak: 0,
  frozen: false, completed: false, targetCount: null, progressCount: 0,
};

function setup(quest?: Quest, questType?: 'habit' | 'one_time') {
  mockParams = quest ? { id: quest.id } : questType ? { type: questType } : {};
  const user: UserProfile = { ...initialUser, timeZone: 'UTC', rank: 'E', quests: quest ? [quest] : [], longQuests: [] };
  mockStore = {
    theme: {
      overlay: '#000', modal: '#111', glassBorder: '#333', handle: '#444', text: '#fff', dim: '#999',
      track: '#222', accentBorder: '#555', accent: '#0ff', muted: '#aaa', accentStrong: '#0ff', accentGlass: '#022',
    },
    user,
    saveHabit: jest.fn().mockResolvedValue(undefined),
    archiveQuest: jest.fn().mockResolvedValue(undefined), restoreQuest: jest.fn().mockResolvedValue(undefined),
    deleteQuest: jest.fn().mockResolvedValue(undefined),
  };
  return mockStore;
}

describe('mobile QuestEditor validation and form layout', () => {
  afterEach(() => { cleanup(); jest.clearAllMocks(); mockStore = undefined; });

  it('explains missing name and penalty requirements while keeping the save footer outside the form scroller', async () => {
    setup();
    await render(<QuestEditorScreen />);
    expect(screen.getByTestId('quest-name-error')).toHaveTextContent('Enter a quest name.');
    expect(screen.getByText(/Add a penalty, or set a target count/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
    const footer = screen.getByTestId('quest-editor-footer');
    expect(StyleSheet.flatten(footer.props.style)).toMatchObject({ flexShrink: 0 });
    expect(footer.parent).toBe(screen.getByTestId('quest-editor-form').parent);
  });

  it('explains a target count of 1 and accepts a count of 2 without a penalty', async () => {
    const value = setup();
    await render(<QuestEditorScreen />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Quest name'), 'Drink water');
    await user.type(screen.getByPlaceholderText('Leave blank for a normal habit'), '1');
    expect(screen.getByText(/target count must be at least 2/i)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
    await user.clear(screen.getByPlaceholderText('Leave blank for a normal habit'));
    await user.type(screen.getByPlaceholderText('Leave blank for a normal habit'), '2');
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    expect(value.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ targetCount: 2 }), undefined);
    await waitFor(() => expect(mockRouterBack).toHaveBeenCalledTimes(1));
  });

  it('requires only a name for a one-time quest', async () => {
    const value = setup(undefined, 'one_time');
    await render(<QuestEditorScreen />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Quest name'), 'Submit report');
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    expect(value.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ questType: 'one_time' }), undefined);
    await waitFor(() => expect(mockRouterBack).toHaveBeenCalledTimes(1));
  });

  it('accepts 80 code points and explains an 81-code-point name', async () => {
    const value = setup();
    await render(<QuestEditorScreen />);
    const user = userEvent.setup();
    await fireEvent.changeText(screen.getByLabelText('Quest name'), '😀'.repeat(81));
    await user.type(screen.getByPlaceholderText('e.g. Code for 20 minutes'), 'One minute');
    expect(screen.getByText(/80 characters or fewer/i)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Quest name'), '😀'.repeat(80));
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    expect(value.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ name: '😀'.repeat(80) }), undefined);
    await waitFor(() => expect(mockRouterBack).toHaveBeenCalledTimes(1));
  });

  it('preserves unchanged grandfathered names and reports an error after a valid submit', async () => {
    const legacyName = '🧭'.repeat(81);
    const quest = { ...existingQuest, name: legacyName };
    const value = setup(quest);
    value.saveHabit.mockRejectedValueOnce(new Error('Save failed'));
    await render(<QuestEditorScreen />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    expect(value.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ name: legacyName }), 'weekday');
    expect(await screen.findByText('Save failed')).toBeOnTheScreen();
  });

  it('starts new habits with every day selected and preserves existing selected days', async () => {
    setup();
    await render(<QuestEditorScreen />);
    for (const day of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
      expect(screen.getByRole('checkbox', { name: day }).props.accessibilityState).toMatchObject({ checked: true });
    }
    cleanup();
    setup(existingQuest);
    await render(<QuestEditorScreen />);
    for (const day of ['Monday', 'Wednesday', 'Friday']) {
      expect(screen.getByRole('checkbox', { name: day }).props.accessibilityState).toMatchObject({ checked: true });
    }
    expect(screen.getByRole('checkbox', { name: 'Sunday' }).props.accessibilityState).toMatchObject({ checked: false });
  });

});
