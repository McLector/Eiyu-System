import { act, cleanup, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import type { Quest } from '@eiyu/shared';

import { consumeBoardReturnIntent } from '../../lib/board-return-intent';
import { habitQuest as habit, makeEditorStore } from '../../test-support/quest-editor-kit';
import { renderWithTheme, TestThemeProvider } from '../ui/test-theme';

let mockSearchParams: { id?: string; type?: string; returnLane?: string } = {};
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
  const passthrough = ({ children, ...props }: { children: unknown; [key: string]: unknown }) => React.createElement(View, props, children);
  return { KeyboardAwareScrollView: passthrough, KeyboardAvoidingView: passthrough };
});
import QuestEditorScreen from '../../app/quest-editor';
const mockRouter = jest.requireMock('expo-router').router as { back: jest.Mock };

function setup(quest: Quest = habit) {
  mockSearchParams = { id: quest.id };
  mockStoreValue = makeEditorStore([quest]);
  return mockStoreValue as ReturnType<typeof makeEditorStore>;
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
    await renderWithTheme(<QuestEditorScreen />);

    await user.press(screen.getByRole('button', { name: 'ARCHIVE QUEST' }));

    expect(value.archiveQuest).toHaveBeenCalledWith('habit-1');
    expect(value.deleteQuest).not.toHaveBeenCalled();
  });

  it('keeps Cancel side-effect free and confirms permanent delete separately', async () => {
    const value = setup();
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);

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
    const rendered = await renderWithTheme(<QuestEditorScreen />);

    await user.press(screen.getByRole('button', { name: 'DELETE PERMANENTLY' }));
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    await act(async () => { fireEvent(rendered.getByTestId('quest-delete-modal'), 'show'); });
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
    focus.mockRestore();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('quest-delete-confirm')).toBeBusy());
    await act(async () => { rendered.getByTestId('quest-delete-modal').props.onRequestClose(); });
    expect(screen.getByText('DELETE Morning walk PERMANENTLY?')).toBeOnTheScreen();
    expect(value.deleteQuest).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('quest-delete-confirm'));
    expect(value.deleteQuest).toHaveBeenCalledTimes(1);

    await act(async () => { resolveDelete(); });
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  });

  it('keeps a mounted delete route in edit mode while its record leaves live store data', async () => {
    const value = setup();
    let resolveDelete!: () => void;
    value.deleteQuest.mockImplementation(() => new Promise<void>(resolve => { resolveDelete = resolve; }));
    const user = userEvent.setup();
    const rendered = await renderWithTheme(<QuestEditorScreen />);

    await user.press(screen.getByRole('button', { name: 'DELETE PERMANENTLY' }));
    await user.press(screen.getByTestId('quest-delete-confirm'));
    expect(screen.getByTestId('quest-delete-confirm')).toBeBusy();
    mockStoreValue = { ...value, user: { ...value.user, quests: [] } };
    await act(async () => { rendered.rerender(<TestThemeProvider><QuestEditorScreen /></TestThemeProvider>); await Promise.resolve(); });

    expect(screen.getByText('EDIT QUEST')).toBeOnTheScreen();
    expect(screen.queryByText('NEW QUEST')).toBeNull();
    expect(screen.queryByRole('button', { name: 'CREATE QUEST' })).toBeNull();
    expect(screen.getByText('DELETE Morning walk PERMANENTLY?')).toBeOnTheScreen();
    await act(async () => { resolveDelete(); });
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  });

  it('keeps the edit form available and reports deletion failure', async () => {
    const value = setup();
    value.deleteQuest.mockRejectedValueOnce(new Error('delete unavailable'));
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);

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
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), 'Submit report');
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(value.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ questType: 'one_time' }), undefined);
    expect(consumeBoardReturnIntent()).toBe('one-time');
  });

  it('does not publish a lane intent when the create fails', async () => {
    const value = setup();
    value.saveHabit.mockRejectedValueOnce(new Error('offline'));
    mockSearchParams = { type: 'one_time', returnLane: 'one-time' };
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), 'Submit report');
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));

    expect(await screen.findByText('offline')).toBeOnTheScreen();
    expect(consumeBoardReturnIntent()).toBeNull();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('shows Restore and Delete for archived quests, without a completion control', async () => {
    const value = setup({ ...habit, archived: true });
    const user = userEvent.setup();
    await renderWithTheme(<QuestEditorScreen />);

    expect(screen.getByRole('button', { name: 'RESTORE QUEST' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'DELETE PERMANENTLY' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Complete|Undo/ })).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'RESTORE QUEST' }));
    expect(value.restoreQuest).toHaveBeenCalledWith('habit-1');
  });

  it('keeps the save action a full-width primary target separate from lifecycle actions', async () => {
    setup();
    await renderWithTheme(<QuestEditorScreen />);

    const actions = screen.getByTestId('quest-editor-actions');
    const save = screen.getByTestId('quest-save');
    expect(StyleSheet.flatten(actions.props.style)).toMatchObject({ flexWrap: 'wrap' });
    expect(save.props.accessibilityRole).toBe('button');
    expect(save.props.accessibilityLabel).toBe('SAVE CHANGES');
    expect(StyleSheet.flatten(save.props.style)).toMatchObject({ flexBasis: '100%' });
  });
});
