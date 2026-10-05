import { act, cleanup, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { Quest } from '@eiyu/shared';

import { consumeBoardReturnIntent } from '../../lib/board-return-intent';
import { habitQuest, makeEditorStore } from '../../test-support/quest-editor-kit';
import { renderWithTheme } from '../ui/test-theme';

let mockParams: { id?: string; type?: string; returnLane?: string } = {};
let mockStore: any;
let mockBeforeRemove: ((event: any) => void) | null = null;
const mockDispatch = jest.fn();

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({
    addListener: (_name: string, handler: (event: any) => void) => { mockBeforeRemove = handler; return () => { mockBeforeRemove = null; }; },
    dispatch: mockDispatch,
  }),
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

import QuestEditorScreen from '../../app/quest-editor';

function setup(quest?: Quest, type?: string) {
  mockParams = quest ? { id: quest.id } : type ? { type } : {};
  mockStore = makeEditorStore(quest ? [quest] : []);
  return mockStore as ReturnType<typeof makeEditorStore>;
}

const oneTime: Quest = { ...habitQuest, id: 'ot', name: 'Submit report', questType: 'one_time', easyVersion: null, days: [], scheduledDate: '2026-12-25', timeSet: true, time: '14:30' };
const backlog: Quest = { ...habitQuest, id: 'bl', name: 'Try Bun', questType: 'backlog', easyVersion: null, days: [], time: '08:00', timeSet: false, genre: 'tool' };

/** Fire the navigator's beforeRemove, as a back press or swipe would; returns whether the editor blocked it. */
async function leave() {
  const event = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
  await act(async () => { mockBeforeRemove?.(event); });
  return event;
}

describe('QuestEditor quest types', () => {
  afterEach(() => { cleanup(); jest.clearAllMocks(); mockStore = undefined; mockParams = {}; mockBeforeRemove = null; });

  it('offers Habit, One-time and Backlog when creating, starting on the one the Board asked for', async () => {
    setup(undefined, 'backlog');
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.getByText('NEW BACKLOG QUEST')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Backlog' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Habit' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'One-time' })).not.toBeChecked();
  });

  it('keeps what was typed when the type changes, and swaps the fields that belong to it', async () => {
    const user = userEvent.setup();
    setup();
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), 'Write notes');
    expect(screen.getByText('NEW QUEST')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('e.g. Code for 20 minutes')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'No set time' })).toBeNull();

    await user.press(screen.getByRole('radio', { name: 'One-time' }));
    expect(screen.getByText('NEW ONE-TIME QUEST')).toBeOnTheScreen();
    expect(screen.getByLabelText('Quest name').props.value).toBe('Write notes');
    expect(screen.queryByPlaceholderText('e.g. Code for 20 minutes')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Sunday' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose quest date' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'No set time' })).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Backlog' }));
    expect(screen.queryByRole('button', { name: 'Choose quest date' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose reminder time' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'No set time' })).toBeNull();
    expect(screen.getByLabelText('Quest name').props.value).toBe('Write notes');
  });

  it('saves a Backlog quest untimed, dateless and without days, with its genre', async () => {
    const user = userEvent.setup();
    const value = setup(undefined, 'backlog');
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), 'Try Bun');
    await user.press(screen.getByRole('radio', { name: 'Tool' }));
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));

    expect(value.saveHabit).toHaveBeenCalledWith(
      expect.objectContaining({ questType: 'backlog', timeSet: false, days: [], scheduledDate: null, genre: 'tool', easyVersion: null, targetCount: null }),
      undefined,
    );
  });

  it('lets a genre be chosen and cleared again on a one-time quest', async () => {
    const user = userEvent.setup();
    const value = setup(undefined, 'one_time');
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), 'Read the RFC');
    await user.press(screen.getByRole('radio', { name: 'Docs / article' }));
    expect(screen.getByRole('radio', { name: 'Docs / article' })).toBeChecked();
    await user.press(screen.getByRole('radio', { name: 'Docs / article' }));
    expect(screen.getByRole('radio', { name: 'Docs / article' })).not.toBeChecked();
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    expect(value.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ genre: null }), undefined);
  });

  it('has no genre for a habit', async () => {
    setup(undefined, 'habit');
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.queryByRole('radio', { name: 'Tool' })).toBeNull();
  });

  it('starts a new one-time quest with No set time on, and saves a time only when it is switched off', async () => {
    const user = userEvent.setup();
    const value = setup(undefined, 'one_time');
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.getByRole('checkbox', { name: 'No set time' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Choose reminder time' })).toBeDisabled();
    await user.type(screen.getByLabelText('Quest name'), 'Submit report');
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    expect(value.saveHabit).toHaveBeenLastCalledWith(expect.objectContaining({ timeSet: false, time: '08:00' }), undefined);
  });

  it('saves a set time once No set time is switched off', async () => {
    const user = userEvent.setup();
    const value = setup(undefined, 'one_time');
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), 'Submit report');
    await user.press(screen.getByRole('checkbox', { name: 'No set time' }));
    expect(screen.getByRole('button', { name: 'Choose reminder time' })).toBeEnabled();
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    expect(value.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ timeSet: true }), undefined);
  });

  it('sends the Board back to the Backlog lane after a Backlog create, and not after an edit', async () => {
    const user = userEvent.setup();
    consumeBoardReturnIntent();
    setup(undefined, 'backlog');
    mockParams = { type: 'backlog', returnLane: 'backlog' };
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), 'Try Bun');
    await user.press(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(mockStore.saveHabit).toHaveBeenCalled());
    expect(consumeBoardReturnIntent()).toBe('backlog');
  });

  it('locks the type on an existing quest', async () => {
    setup(oneTime);
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.getByText('EDIT QUEST')).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Backlog' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Habit' })).toBeNull();
  });

  it('keeps a one-time quest on its own date and time when it is edited', async () => {
    const user = userEvent.setup();
    const value = setup(oneTime);
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.queryByRole('button', { name: 'Choose quest date' })).toBeNull();
    expect(screen.getByText('Dec 25, 2026')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Quest name'), '!');
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));

    expect(value.saveHabit).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledDate: '2026-12-25', timeSet: true, time: '14:30', questType: 'one_time' }),
      'ot',
    );
  });

  it('keeps a Backlog quest’s genre when it is edited without touching it', async () => {
    const user = userEvent.setup();
    const value = setup(backlog);
    await renderWithTheme(<QuestEditorScreen />);
    expect(screen.getByRole('radio', { name: 'Tool' })).toBeChecked();
    await user.type(screen.getByLabelText('Quest name'), '!');
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    expect(value.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ genre: 'tool', timeSet: false, days: [] }), 'bl');
  });

  it('never sends a genre for a habit', async () => {
    const user = userEvent.setup();
    const value = setup(habitQuest);
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), '!');
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    expect(value.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ genre: null, timeSet: true }), 'habit-1');
  });
});

describe('QuestEditor discard guard', () => {
  afterEach(() => { cleanup(); jest.clearAllMocks(); mockStore = undefined; mockParams = {}; mockBeforeRemove = null; });

  it('lets an untouched editor close without asking', async () => {
    setup(habitQuest);
    await renderWithTheme(<QuestEditorScreen />);
    expect((await leave()).preventDefault).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Discard changes?')).toBeNull();
  });

  it('asks before throwing away edits, and Keep Editing leaves everything as it was', async () => {
    const user = userEvent.setup();
    setup(habitQuest);
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), '!');

    expect((await leave()).preventDefault).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText('Discard changes?')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Keep Editing' }));
    expect(screen.queryByLabelText('Discard changes?')).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Quest name').props.value).toBe('Morning walk!');
  });

  it('Discard Changes carries out the navigation that was held back', async () => {
    const user = userEvent.setup();
    setup(habitQuest);
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), '!');
    const event = await leave();
    await user.press(await screen.findByRole('button', { name: 'Discard Changes' }));
    expect(mockDispatch).toHaveBeenCalledWith(event.data.action);
  });

  it('asks on a new quest as soon as anything is typed, but not before', async () => {
    const user = userEvent.setup();
    setup(undefined, 'one_time');
    await renderWithTheme(<QuestEditorScreen />);
    expect((await leave()).preventDefault).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Quest name'), 'a');
    expect((await leave()).preventDefault).toHaveBeenCalledTimes(1);
  });

  it('does not ask again after a successful save has begun closing the screen', async () => {
    const user = userEvent.setup();
    setup(habitQuest);
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), '!');
    await user.press(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mockStore.saveHabit).toHaveBeenCalled());
    expect((await leave()).preventDefault).not.toHaveBeenCalled();
  });

  it('does not ask after archive, restore or delete either', async () => {
    const user = userEvent.setup();
    setup(habitQuest);
    await renderWithTheme(<QuestEditorScreen />);
    await user.type(screen.getByLabelText('Quest name'), '!');
    await user.press(screen.getByRole('button', { name: 'ARCHIVE QUEST' }));
    await waitFor(() => expect(mockStore.archiveQuest).toHaveBeenCalled());
    expect((await leave()).preventDefault).not.toHaveBeenCalled();
  });
});
