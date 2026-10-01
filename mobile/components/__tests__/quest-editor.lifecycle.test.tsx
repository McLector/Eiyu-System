import { act, cleanup, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import type { Quest, UserProfile } from '@eiyu/shared';
import { initialUser } from '@eiyu/shared';
import { consumeBoardReturnIntent } from '../../lib/board-return-intent';

let mockSearchParams: { id?: string; type?: string; returnLane?: string } = {};
let mockStoreValue: any;

jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => mockSearchParams }));
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStoreValue }));
jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    KeyboardAwareScrollView: ({ children, ...props }: { children: unknown; [key: string]: unknown }) =>
      React.createElement(View, props, children),
  };
});
jest.mock('@/components/eiyu/screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Screen: ({ children, ...props }: { children: unknown; [key: string]: unknown }) => React.createElement(View, props, children) };
});
import QuestEditorScreen from '../../app/quest-editor';
const mockRouter = jest.requireMock('expo-router').router as { back: jest.Mock };

const habit: Quest = {
  id: 'habit-1',
  name: 'Morning walk',
  stat: 'STR',
  difficulty: 'Medium',
  easyVersion: 'Walk for one minute',
  description: null,
  questType: 'habit',
  archived: false,
  time: '08:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  streak: 2,
  frozen: false,
  completed: false,
  targetCount: null,
  progressCount: 0,
};

function setup(quest: Quest = habit) {
  mockSearchParams = { id: quest.id };
  const user: UserProfile = { ...initialUser, timeZone: 'UTC', rank: 'E', quests: [quest], longQuests: [] };
  const value = {
    theme: {
      overlay: '#000', modal: '#111', glassBorder: '#333', handle: '#444', text: '#fff', dim: '#999',
      track: '#222', accentBorder: '#555', accent: '#0ff', muted: '#aaa', accentStrong: '#0ff', accentGlass: '#022',
    },
    user,
    saveHabit: jest.fn().mockResolvedValue(undefined),
    archiveQuest: jest.fn().mockResolvedValue(undefined),
    restoreQuest: jest.fn().mockResolvedValue(undefined),
    deleteQuest: jest.fn().mockResolvedValue(undefined),
  };
  mockStoreValue = value;
  return value;
}

describe('mobile QuestEditor lifecycle controls', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
    consumeBoardReturnIntent();
    mockSearchParams = {};
    mockStoreValue = undefined;
  });

  it('archives active quests through archive only', async () => {
    const value = setup();
    const user = userEvent.setup();
    await render(<QuestEditorScreen />);

    await user.press(screen.getByRole('button', { name: 'ARCHIVE QUEST' }));

    expect(value.archiveQuest).toHaveBeenCalledWith('habit-1');
    expect(value.deleteQuest).not.toHaveBeenCalled();
  });

  it('keeps Cancel side-effect free and confirms permanent delete separately', async () => {
    const value = setup();
    const user = userEvent.setup();
    await render(<QuestEditorScreen />);

    await user.press(screen.getByRole('button', { name: 'DELETE PERMANENTLY' }));
    expect(screen.getByText('DELETE Morning walk PERMANENTLY?')).toBeOnTheScreen();
    expect(screen.getByText(/History, Weekly Review, and earned XP remain/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(value.deleteQuest).not.toHaveBeenCalled();

    await user.press(screen.getByRole('button', { name: 'DELETE PERMANENTLY' }));
    await user.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
    expect(value.deleteQuest).toHaveBeenCalledWith('habit-1');
    expect(value.archiveQuest).not.toHaveBeenCalled();
  });

  it('keeps the confirmation open on Android Back and repeated taps while deletion is pending', async () => {
    const value = setup();
    let resolveDelete!: () => void;
    value.deleteQuest.mockImplementation(() => new Promise<void>(resolve => { resolveDelete = resolve; }));
    const user = userEvent.setup();
    const rendered = await render(<QuestEditorScreen />);

    await user.press(screen.getByRole('button', { name: 'DELETE PERMANENTLY' }));
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    await act(async () => { fireEvent(rendered.getByTestId('quest-delete-modal'), 'show'); });
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
    focus.mockRestore();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm permanent delete' })).toBeDisabled());
    await act(async () => { rendered.getByTestId('quest-delete-modal').props.onRequestClose(); });
    expect(screen.getByText('DELETE Morning walk PERMANENTLY?')).toBeOnTheScreen();
    expect(value.deleteQuest).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
    expect(value.deleteQuest).toHaveBeenCalledTimes(1);

    await act(async () => { resolveDelete(); });
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  });

  it('keeps a mounted delete route in edit mode while its record leaves live store data', async () => {
    const value = setup();
    let resolveDelete!: () => void;
    value.deleteQuest.mockImplementation(() => new Promise<void>(resolve => { resolveDelete = resolve; }));
    const user = userEvent.setup();
    const rendered = await render(<QuestEditorScreen />);

    await user.press(screen.getByRole('button', { name: 'DELETE PERMANENTLY' }));
    await user.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
    expect(screen.getByText('DELETING…')).toBeOnTheScreen();
    mockStoreValue = { ...value, user: { ...value.user, quests: [] } };
    await act(async () => { rendered.rerender(<QuestEditorScreen />); await Promise.resolve(); });

    expect(screen.getByText('EDIT QUEST')).toBeOnTheScreen();
    expect(screen.queryByText('NEW QUEST')).toBeNull();
    expect(screen.queryByRole('button', { name: 'CREATE QUEST' })).toBeNull();
    expect(screen.getByText('DELETING…')).toBeOnTheScreen();
    await act(async () => { resolveDelete(); });
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  });

  it('keeps the edit form available and reports deletion failure', async () => {
    const value = setup();
    value.deleteQuest.mockRejectedValueOnce(new Error('delete unavailable'));
    const user = userEvent.setup();
    await render(<QuestEditorScreen />);

    await user.press(screen.getByRole('button', { name: 'DELETE PERMANENTLY' }));
    await user.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
    expect((await screen.findAllByText('delete unavailable')).length).toBeGreaterThan(0);
    expect(screen.getByText('EDIT QUEST')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'SAVE CHANGES' })).toBeEnabled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('publishes a one-use One Time lane intent only after a successful one-time create', async () => {
    const value = setup();
    mockSearchParams = { type: 'one_time', returnLane: 'one-time' };
    const user = userEvent.setup();
    await render(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), 'Submit report');
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(value.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ questType: 'one_time' }), undefined);
    expect(consumeBoardReturnIntent()).toBe('one-time');
  });

  it('shows Restore and Delete for archived quests, without a completion control', async () => {
    const value = setup({ ...habit, archived: true });
    const user = userEvent.setup();
    await render(<QuestEditorScreen />);

    expect(screen.getByRole('button', { name: 'RESTORE QUEST' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'DELETE PERMANENTLY' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Complete|Undo/ })).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'RESTORE QUEST' }));
    expect(value.restoreQuest).toHaveBeenCalledWith('habit-1');
  });

  it('keeps the save action a full-width primary target separate from lifecycle actions', async () => {
    await setup();
    await render(<QuestEditorScreen />);

    const actions = screen.getByTestId('quest-editor-actions');
    const save = screen.getByTestId('quest-save');
    expect(StyleSheet.flatten(actions.props.style)).toMatchObject({ flexWrap: 'wrap' });
    expect(save.props.accessibilityRole).toBe('button');
    expect(save.props.accessibilityLabel).toBe('SAVE CHANGES');
    expect(StyleSheet.flatten(save.props.style)).toMatchObject({ flexBasis: '100%' });
  });
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
