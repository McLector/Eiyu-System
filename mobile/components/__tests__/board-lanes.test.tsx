import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import type { Quest, UserProfile } from '@eiyu/shared';
import { initialUser } from '@eiyu/shared';

import BoardScreen from '../../app/(tabs)/board';
import { consumeBoardReturnIntent, publishBoardReturnIntent } from '../../lib/board-return-intent';
import { hapticLight, hapticSuccess } from '../../lib/haptics';
import { renderWithTheme, TestThemeProvider } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockFocusCallbacks: (() => unknown)[] = [];
let mockStoreValue: any;
let mockBoardParams: { lane?: string } = {};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), setParams: jest.fn() },
  useFocusEffect: (callback: () => unknown) => { mockFocusCallbacks.push(callback); },
  useLocalSearchParams: () => mockBoardParams,
}));
const mockRouter = jest.requireMock('expo-router').router as { push: jest.Mock; setParams: jest.Mock };
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStoreValue }));
jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const habit: Quest = {
  id: 'daily', name: 'Daily habit', stat: 'STR', difficulty: 'Medium',
  easyVersion: 'One minute', description: null, questType: 'habit', archived: false,
  time: '08:00', days: [1, 3, 5], streak: 0, frozen: false, dailyEligible: true,
  completed: false, targetCount: null, progressCount: 0,
};
const backlogItem: Quest = {
  ...habit, id: 'idea', name: 'Try Zig', questType: 'backlog', days: [], dailyEligible: false, genre: 'tool', timeSet: false,
};

function setup() {
  mockRouter.push.mockClear();
  mockRouter.setParams.mockClear();
  (hapticLight as jest.Mock).mockClear();
  (hapticSuccess as jest.Mock).mockClear();
  mockFocusCallbacks = [];
  mockBoardParams = {};
  consumeBoardReturnIntent();
  const quests: Quest[] = [
    habit,
    { ...habit, id: 'off-day', name: 'Off-day habit', dailyEligible: false },
    { ...habit, id: 'archived', name: 'Archived habit', archived: true, dailyEligible: false },
  ];
  const user: UserProfile = { ...initialUser, timeZone: 'UTC', rank: 'E', quests, longQuests: [] };
  mockStoreValue = {
    user,
    backlog: [],
    questsLoading: false,
    questsError: null,
    questsHaveCachedData: true,
    retryQuests: jest.fn(),
    toggleQuest: jest.fn(),
    adjustProgress: jest.fn(),
    completeRecovery: jest.fn(),
    reminderWarning: null,
    retryReminders: jest.fn(),
    syncStates: new Map(),
    syncWaiting: 0,
    syncOffline: false,
    failedSyncs: [],
    retrySync: jest.fn(),
    dismissSync: jest.fn(),
    archiveQuest: jest.fn().mockResolvedValue(undefined),
    restoreQuest: jest.fn().mockResolvedValue(undefined),
    deleteQuest: jest.fn().mockResolvedValue(undefined),
    moveToOneTime: jest.fn().mockResolvedValue(undefined),
    moveToBacklog: jest.fn().mockResolvedValue(undefined),
  };
}
const board = () => renderWithTheme(<BoardScreen />);
const oneTimeQuest = (overrides: Partial<Quest> = {}): Quest => ({ ...habit, id: 'one-time', name: 'Today only', questType: 'one_time', days: [], ...overrides } as Quest);
const openActions = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.press(screen.getByRole('button', { name: `More actions for ${name}` }));
};
const choose = async (user: ReturnType<typeof userEvent.setup>, action: string) => {
  await user.press(screen.getByRole('menuitem', { name: action }));
};

describe('mobile BoardScreen lanes', () => {
  beforeEach(setup);

  it('counts a mixed board and keeps each actionable quest in its own lane', async () => {
    mockStoreValue.user = { ...mockStoreValue.user, quests: [habit, oneTimeQuest({ completed: true })] };
    const user = userEvent.setup();
    await board();
    expect(screen.getByText('1/2')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Open Daily habit details' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Open Today only details' })).toBeNull();
    await user.press(screen.getByRole('tab', { name: 'ONE TIME QUEST' }));
    expect(screen.getByRole('button', { name: 'Open Today only details' })).toBeOnTheScreen();
  });

  it('counts a one-time-only board', async () => {
    mockStoreValue.user = { ...mockStoreValue.user, quests: [oneTimeQuest({ completed: true })] };
    await board();
    expect(screen.getByText('1/1')).toBeOnTheScreen();
  });

  it('keeps a quest note out of the row and shows it in the details instead', async () => {
    mockStoreValue.user = { ...mockStoreValue.user, quests: [{ ...habit, description: 'A longer note' }] };
    const user = userEvent.setup();
    await board();
    expect(screen.queryByText('A longer note')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Open Daily habit details' }));
    expect(screen.getByText('QUEST DETAILS')).toBeOnTheScreen();
    expect(screen.getByText('A longer note')).toBeOnTheScreen();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('opens the editor from the details sheet', async () => {
    const user = userEvent.setup();
    await board();
    await user.press(screen.getByRole('button', { name: 'Open Daily habit details' }));
    await user.press(screen.getByRole('button', { name: 'Edit quest' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/quest-editor', params: { id: 'daily' } });
  });

  it('offers three lanes by name, with Backlog in place of All Habits and Archived', async () => {
    await board();
    for (const label of ['DAILY QUEST', 'ONE TIME QUEST', 'BACKLOG']) expect(screen.getByRole('tab', { name: label })).toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'ALL HABITS' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'ARCHIVED' })).toBeNull();
  });

  it('keeps the lane selector a wrapping row for narrow and large-text screens', async () => {
    await board();
    const laneTabs = screen.getByTestId('board-lane-tabs');
    expect(laneTabs.props.horizontal).toBeUndefined();
    expect(laneTabs.props.style.flexWrap).toBe('wrap');
  });

  it('shows only the Daily habits that are due, and reaches the rest through All Habits', async () => {
    const user = userEvent.setup();
    await board();
    expect(screen.getByText('Daily habit')).toBeOnTheScreen();
    expect(screen.queryByText('Off-day habit')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'ALL HABITS' }));
    expect(screen.getByText('Off-day habit')).toBeOnTheScreen();
    expect(screen.queryByText('Archived habit')).toBeNull();
  });

  it('lists Backlog quests in the Backlog lane', async () => {
    mockStoreValue.backlog = [backlogItem];
    const user = userEvent.setup();
    await board();
    expect(screen.queryByText('Try Zig')).toBeNull();
    await user.press(screen.getByRole('tab', { name: 'BACKLOG' }));
    expect(screen.getByText('Try Zig')).toBeOnTheScreen();
    expect(screen.queryByTestId('quest-checkbox')).toBeNull();
  });

  it('says what an empty lane is for', async () => {
    const user = userEvent.setup();
    mockStoreValue.user = { ...mockStoreValue.user, quests: [] };
    await board();
    expect(screen.getByText('No habits are scheduled for today. Create one or check All Habits.')).toBeOnTheScreen();
    await user.press(screen.getByRole('tab', { name: 'ONE TIME QUEST' }));
    expect(screen.getByText('No one-time quests scheduled for today.')).toBeOnTheScreen();
    await user.press(screen.getByRole('tab', { name: 'BACKLOG' }));
    expect(screen.getByText(/Nothing in the Backlog/)).toBeOnTheScreen();
  });

  it('follows a swipe to another lane, and hides the lanes that are off screen from screen readers', async () => {
    mockStoreValue.backlog = [backlogItem];
    await board();
    await act(async () => { screen.getByTestId('board-pager').props.onPageSelected({ nativeEvent: { position: 2 } }); });
    expect(screen.getByRole('tab', { name: 'BACKLOG' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('Try Zig')).toBeOnTheScreen();
    expect(screen.queryByText('Daily habit')).toBeNull();
  });
});

describe('mobile BoardScreen completing quests', () => {
  beforeEach(setup);

  it('completes a quest with a success cue and an XP flash', async () => {
    await board();
    await userEvent.setup().press(screen.getByTestId('quest-checkbox'));
    expect(mockStoreValue.toggleQuest).toHaveBeenCalledWith('daily');
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/^\+\d+ XP$/)).toBeOnTheScreen();
  });

  it('undoes a completed quest with a light cue and no XP flash', async () => {
    mockStoreValue.user = { ...mockStoreValue.user, quests: [{ ...habit, completed: true }] };
    await board();
    await userEvent.setup().press(screen.getByTestId('quest-checkbox'));
    expect(mockStoreValue.toggleQuest).toHaveBeenCalledWith('daily');
    expect(hapticLight).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/XP$/)).toBeNull();
  });

  it('steps the progress of a quest with a target', async () => {
    mockStoreValue.user = { ...mockStoreValue.user, quests: [{ ...habit, targetCount: 5, progressCount: 1 }] };
    await board();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Increase progress for Daily habit' }));
    expect(mockStoreValue.adjustProgress).toHaveBeenCalledWith('daily', 1);
  });
});

describe('mobile BoardScreen quest actions', () => {
  beforeEach(setup);

  it('opens the actions from the more button and from a long press', async () => {
    const user = userEvent.setup();
    await board();
    await openActions(user, 'Daily habit');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Close' }));
    await fireEvent(screen.getByTestId('quest-edit-trigger'), 'longPress');
    expect(await screen.findByRole('menuitem', { name: 'Archive' })).toBeOnTheScreen();
  });

  it('offers a habit no move, and Edit goes to the editor', async () => {
    const user = userEvent.setup();
    await board();
    await openActions(user, 'Daily habit');
    expect(screen.queryByRole('menuitem', { name: /Move to/ })).toBeNull();
    await choose(user, 'Edit quest');
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/quest-editor', params: { id: 'daily' } });
  });

  it('holds the row while an archive is pending, calls it once, and then offers Undo', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    mockStoreValue.archiveQuest.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    await board();
    await openActions(user, 'Daily habit');
    await choose(user, 'Archive');
    const more = screen.getByRole('button', { name: 'More actions for Daily habit' });
    expect(more).toBeDisabled();
    expect(more).toBeBusy();
    await user.press(more);
    expect(mockStoreValue.archiveQuest).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Habit archived')).toBeNull();
    await act(async () => { release(); });
    expect(screen.getByRole('button', { name: 'More actions for Daily habit' })).toBeEnabled();
    expect(screen.getByText('Habit archived')).toBeOnTheScreen();
  });

  it('undoes an archive from the notice', async () => {
    const user = userEvent.setup();
    await board();
    await openActions(user, 'Daily habit');
    await choose(user, 'Archive');
    await user.press(await screen.findByRole('button', { name: 'Undo' }));
    expect(mockStoreValue.restoreQuest).toHaveBeenCalledWith('daily');
    await waitFor(() => expect(screen.queryByText('Habit archived')).toBeNull());
  });

  it('sends "View archived habits" to the account menu\'s archived sheet', async () => {
    const user = userEvent.setup();
    await board();
    await openActions(user, 'Daily habit');
    await choose(user, 'Archive');
    await user.press(await screen.findByRole('button', { name: 'View archived habits' }));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ account: 'archived' });
  });

  it('does not show an archive notice when the archive fails', async () => {
    const user = userEvent.setup();
    mockStoreValue.archiveQuest.mockRejectedValueOnce(new Error('offline'));
    await board();
    await openActions(user, 'Daily habit');
    await choose(user, 'Archive');
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText('Habit archived')).toBeNull();
  });

  it('moves a Backlog quest to One-time', async () => {
    mockStoreValue.backlog = [backlogItem];
    const user = userEvent.setup();
    await board();
    await user.press(screen.getByRole('tab', { name: 'BACKLOG' }));
    await openActions(user, 'Try Zig');
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).toBeNull();
    await choose(user, 'Move to One-time');
    expect(mockStoreValue.moveToOneTime).toHaveBeenCalledWith('idea');
    expect(hapticLight).toHaveBeenCalled();
  });

  it('moves an unfinished One-time quest to Backlog, but not a finished one', async () => {
    const user = userEvent.setup();
    mockStoreValue.user = { ...mockStoreValue.user, quests: [oneTimeQuest(), oneTimeQuest({ id: 'done', name: 'Finished', completed: true })] };
    await board();
    await user.press(screen.getByRole('tab', { name: 'ONE TIME QUEST' }));
    await openActions(user, 'Finished');
    expect(screen.queryByRole('menuitem', { name: 'Move to Backlog' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Close' }));
    await openActions(user, 'Today only');
    await choose(user, 'Move to Backlog');
    expect(mockStoreValue.moveToBacklog).toHaveBeenCalledWith('one-time');
  });

  it('calls a move once when it is pressed twice in a row', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    mockStoreValue.moveToBacklog.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    mockStoreValue.user = { ...mockStoreValue.user, quests: [oneTimeQuest()] };
    await board();
    await user.press(screen.getByRole('tab', { name: 'ONE TIME QUEST' }));
    await openActions(user, 'Today only');
    await choose(user, 'Move to Backlog');
    await user.press(screen.getByRole('button', { name: 'More actions for Today only' }));
    expect(mockStoreValue.moveToBacklog).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
  });
});

describe('mobile BoardScreen deleting', () => {
  beforeEach(setup);

  it('requires a named retention confirmation before deleting', async () => {
    const user = userEvent.setup();
    const rendered = await board();
    await openActions(user, 'Daily habit');
    await choose(user, 'Delete permanently');

    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    await act(async () => { fireEvent(rendered.getByTestId('board-delete-modal'), 'show'); });
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
    focus.mockRestore();

    expect(screen.getByText('DELETE Daily habit PERMANENTLY?')).toBeOnTheScreen();
    expect(screen.getByText(/History, Weekly Review, and earned XP remain/)).toBeOnTheScreen();
    expect(mockStoreValue.deleteQuest).not.toHaveBeenCalled();
    await act(async () => { rendered.getByTestId('board-delete-modal').props.onRequestClose(); });
    expect(mockStoreValue.deleteQuest).not.toHaveBeenCalled();
    await waitFor(() => expect(rendered.queryByTestId('board-delete-modal')).toBeNull());

    await openActions(user, 'Daily habit');
    await choose(user, 'Delete permanently');
    await user.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
    expect(mockStoreValue.deleteQuest).toHaveBeenCalledTimes(1);
    expect(mockStoreValue.deleteQuest).toHaveBeenCalledWith('daily');
  });

  it('blocks Back and repeat confirmation while pending, then keeps an error for retry', async () => {
    const user = userEvent.setup();
    let rejectDelete!: (error: Error) => void;
    mockStoreValue.deleteQuest
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectDelete = reject; }))
      .mockResolvedValueOnce(undefined);
    const rendered = await board();
    await openActions(user, 'Daily habit');
    await choose(user, 'Delete permanently');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm permanent delete' })).toBeBusy());
    await act(async () => { rendered.getByTestId('board-delete-modal').props.onRequestClose(); });
    expect(rendered.getByTestId('board-delete-modal')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
    expect(mockStoreValue.deleteQuest).toHaveBeenCalledTimes(1);

    await act(async () => { rejectDelete(new Error('network offline')); });
    expect(screen.getByText('network offline')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Confirm permanent delete' })).toBeEnabled();
    await user.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
    expect(mockStoreValue.deleteQuest).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(rendered.queryByTestId('board-delete-modal')).toBeNull());
  });
});

describe('mobile BoardScreen recovery', () => {
  beforeEach(setup);

  it('shows a banner for frozen streaks and completes the recovery from its sheet', async () => {
    const user = userEvent.setup();
    mockStoreValue.user = { ...mockStoreValue.user, quests: [{ ...habit, id: 'ice', name: 'Frozen habit', frozen: true, frozenHoursLeft: 5 }] };
    await board();
    expect(screen.queryByText('Mark Recovery Complete')).toBeNull();
    await user.press(screen.getByRole('button', { name: /Recovery required/ }));
    expect(screen.getByText('Penalty: One minute')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Mark recovery complete for Frozen habit' }));
    expect(mockStoreValue.completeRecovery).toHaveBeenCalledWith('ice');
    expect(screen.getByText(/^\+\d+ XP$/)).toBeOnTheScreen();
  });

  it('shows no banner when nothing is frozen', async () => {
    await board();
    expect(screen.queryByRole('button', { name: /Recovery required/ })).toBeNull();
  });
});

describe('mobile BoardScreen load states', () => {
  beforeEach(setup);

  it('keeps saved quest rows visible with a friendly offline banner after a failed update', async () => {
    mockStoreValue.questsError = "You're offline. Your update wasn't saved. Your saved quests are still shown.";
    await board();
    expect(screen.getByText('Daily habit')).toBeOnTheScreen();
    expect(screen.getByText(/You're offline/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Retry quests' })).toBeOnTheScreen();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });

  it('offers a full-page Retry state when a first quest load fails without cache', async () => {
    mockStoreValue.questsHaveCachedData = false;
    mockStoreValue.questsError = "You're offline. Your quests couldn't be loaded. Check your connection or retry.";
    await board();
    expect(screen.getByText(/Couldn't load quests:/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Retry quests' })).toBeOnTheScreen();
    expect(screen.queryByText('Daily habit')).toBeNull();
  });

  it('shows a loading state while the first load runs', async () => {
    mockStoreValue.questsHaveCachedData = false;
    mockStoreValue.questsLoading = true;
    await board();
    expect(screen.getByText(/Loading today's quests/)).toBeOnTheScreen();
    expect(screen.queryByText('Daily habit')).toBeNull();
  });

  it('runs Retry', async () => {
    mockStoreValue.questsError = 'Something failed';
    await board();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Retry quests' }));
    expect(mockStoreValue.retryQuests).toHaveBeenCalledTimes(1);
  });

  it('shows a reminder warning with its own Retry', async () => {
    mockStoreValue.reminderWarning = 'Quest archived, but reminders could not be updated: nope';
    await board();
    expect(screen.getByRole('alert', { name: /reminders could not be updated/ })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Retry reminders' }));
    expect(mockStoreValue.retryReminders).toHaveBeenCalledTimes(1);
  });
});

describe('mobile BoardScreen lane memory and adding', () => {
  beforeEach(setup);

  it('consumes the one-time return intent once and opens the One Time lane', async () => {
    mockStoreValue.user = { ...mockStoreValue.user, quests: [habit, oneTimeQuest({ name: 'Created from Daily', dailyEligible: true })] };
    publishBoardReturnIntent('one-time');
    await board();
    await act(async () => { mockFocusCallbacks[0]?.(); });
    expect(screen.getByRole('tab', { name: 'ONE TIME QUEST' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('Created from Daily')).toBeOnTheScreen();
    expect(consumeBoardReturnIntent()).toBeNull();
  });

  it('opens the lane a tapped reminder asks for, then clears the request so it is not replayed', async () => {
    mockBoardParams = { lane: 'one-time' };
    await board();
    expect(screen.getByRole('tab', { name: 'ONE TIME QUEST' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(mockRouter.setParams).toHaveBeenCalledWith({ lane: undefined });
  });

  it('ignores a lane request it does not know', async () => {
    mockBoardParams = { lane: 'weekly' };
    await board();
    expect(screen.getByRole('tab', { name: 'DAILY QUEST' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(mockRouter.setParams).not.toHaveBeenCalled();
  });

  it('does not change a selected lane when an unrelated refresh adds a one-time quest', async () => {
    const rendered = await board();
    mockStoreValue.user = { ...mockStoreValue.user, quests: [habit, oneTimeQuest({ id: 'remote-one-time' })] };
    await rendered.rerender(<TestThemeProvider><BoardScreen /></TestThemeProvider>);
    expect(screen.getByRole('tab', { name: 'DAILY QUEST' }).props.accessibilityState).toMatchObject({ selected: true });
  });

  it('contains an 80-character profile name beside the rank badge', async () => {
    const longName = 'M'.repeat(80);
    mockStoreValue.user = { ...mockStoreValue.user, name: longName };
    await board();
    const profileName = screen.getByTestId('board-profile-name');
    expect(profileName).toHaveTextContent(longName);
    expect(profileName.props.numberOfLines).toBe(2);
    expect(profileName.props.ellipsizeMode).toBe('tail');
  });

  it('keeps all three quest-type choices inside the chooser scroll viewport, and starts the editor for the one picked', async () => {
    const user = userEvent.setup();
    await board();
    await user.press(screen.getByRole('button', { name: 'ADD A QUEST' }));
    expect(screen.getByTestId('board-type-chooser-scroll')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create a habit quest' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create a one-time quest' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create a backlog quest' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Create a one-time quest' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/quest-editor', params: { type: 'one_time', returnLane: 'one-time' } });
  });

  it('starts the editor on a Backlog quest and returns to the Backlog lane', async () => {
    const user = userEvent.setup();
    await board();
    await user.press(screen.getByRole('button', { name: 'ADD A QUEST' }));
    await user.press(screen.getByRole('button', { name: 'Create a backlog quest' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/quest-editor', params: { type: 'backlog', returnLane: 'backlog' } });
  });

  it('starts the habit editor for a habit', async () => {
    const user = userEvent.setup();
    await board();
    await user.press(screen.getByRole('button', { name: 'ADD A QUEST' }));
    await user.press(screen.getByRole('button', { name: 'Create a habit quest' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/quest-editor');
  });
});

describe('mobile BoardScreen offline sync', () => {
  beforeEach(setup);
  const failedEntry = (overrides: Record<string, unknown> = {}) => ({
    id: 'f1', userId: 'u', kind: 'complete', habitId: 'daily', accountDate: '2026-10-05', createdAt: 1, attempts: 1, status: 'failed',
    label: 'Daily habit', failure: { reason: 'not-on-board', message: "Not saved: this quest is no longer on today's board." }, ...overrides,
  });

  it('shows nothing extra when everything is synced', async () => {
    await board();
    expect(screen.queryByTestId('sync-notice')).toBeNull();
    expect(screen.queryByTestId('quest-sync-tag')).toBeNull();
  });

  it('tags the quest row and counts waiting changes in the notice', async () => {
    mockStoreValue.syncStates = new Map([['daily', 'pending']]);
    mockStoreValue.syncWaiting = 1;
    mockStoreValue.syncOffline = true;
    await board();
    expect(screen.getByText('1 change waiting to sync')).toBeOnTheScreen();
    expect(screen.getByTestId('quest-sync-tag')).toHaveTextContent('Waiting to sync');
  });

  it('opens the review sheet from the notice and retries or dismisses from it', async () => {
    mockStoreValue.syncStates = new Map([['daily', 'failed']]);
    mockStoreValue.failedSyncs = [failedEntry()];
    const user = userEvent.setup();
    await board();
    expect(screen.getByText('1 change not saved')).toBeOnTheScreen();
    expect(screen.queryByText('NOT SAVED')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Review changes that were not saved' }));
    expect(screen.getByText('NOT SAVED')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Retry Daily habit' }));
    expect(mockStoreValue.retrySync).toHaveBeenCalledWith('f1');
    await user.press(screen.getByRole('button', { name: 'Dismiss Daily habit' }));
    expect(mockStoreValue.dismissSync).toHaveBeenCalledWith('f1');
  });

  it('closes the review sheet by itself once nothing is left to review', async () => {
    mockStoreValue.failedSyncs = [failedEntry()];
    const user = userEvent.setup();
    const view = await board();
    await user.press(screen.getByRole('button', { name: 'Review changes that were not saved' }));
    expect(screen.getByText('NOT SAVED')).toBeOnTheScreen();
    mockStoreValue.failedSyncs = [];
    await view.rerender(<TestThemeProvider><BoardScreen /></TestThemeProvider>);
    expect(screen.queryByText('NOT SAVED')).toBeNull();
  });
});
