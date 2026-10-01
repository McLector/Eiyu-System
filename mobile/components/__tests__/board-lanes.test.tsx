import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import type { Quest, UserProfile } from '@eiyu/shared';
import { initialUser } from '@eiyu/shared';
import { consumeBoardReturnIntent, publishBoardReturnIntent } from '../../lib/board-return-intent';
import BoardScreen from '../../app/(tabs)/board';

const mockRouter = { push: jest.fn() };
let mockFocusCallbacks: Array<() => unknown> = [];
let mockStoreValue: any;

jest.mock('expo-router', () => ({ router: mockRouter, useFocusEffect: (callback: () => unknown) => { mockFocusCallbacks.push(callback); } }));
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStoreValue }));
jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('@/components/eiyu/icons', () => ({
  CheckIcon: () => null,
  PlusIcon: () => null,
  SnowflakeIcon: () => null,
  StatIcon: () => null,
}));
jest.mock('@/components/eiyu/divider', () => ({ Divider: () => null }));
jest.mock('@/components/eiyu/ghost-button', () => ({
  GhostButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
    const { Pressable, Text } = jest.requireActual('react-native');
    return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}><Text>{label}</Text></Pressable>;
  },
}));
jest.mock('@/components/eiyu/glass-view', () => ({ GlassView: 'View' }));
jest.mock('@/components/eiyu/page-background', () => ({ PageBackground: () => null }));
jest.mock('@/components/eiyu/screen', () => ({ Screen: 'View' }));

const habit: Quest = {
  id: 'daily', name: 'Daily habit', stat: 'STR', difficulty: 'Medium',
  easyVersion: 'One minute', description: null, questType: 'habit', archived: false,
  time: '08:00', days: [1, 3, 5], streak: 0, frozen: false, dailyEligible: true,
  completed: false, targetCount: null, progressCount: 0,
};

function setup() {
  mockRouter.push.mockClear();
  mockFocusCallbacks = [];
  consumeBoardReturnIntent();
  const quests: Quest[] = [
    habit,
    { ...habit, id: 'off-day', name: 'Off-day habit', dailyEligible: false },
    { ...habit, id: 'archived', name: 'Archived habit', archived: true, dailyEligible: false },
  ];
  const user: UserProfile = { ...initialUser, timeZone: 'UTC', rank: 'E', quests, longQuests: [] };
  mockStoreValue = {
    theme: {
      body: '#000', modal: '#111', overlay: '#000', glassBorder: '#333', handle: '#444', text: '#fff',
      dim: '#999', track: '#222', accentBorder: '#555', accent: '#0ff', muted: '#aaa', accentStrong: '#0ff', accentGlass: '#022',
    },
    user,
    questsLoading: false,
    questsError: null,
    questsHaveCachedData: true,
    retryQuests: jest.fn(),
    toggleQuest: jest.fn(),
    completeEasy: jest.fn(),
    adjustProgress: jest.fn(),
    completeRecovery: jest.fn(),
    reminderWarning: null,
    archiveQuest: jest.fn().mockResolvedValue(undefined),
    restoreQuest: jest.fn().mockResolvedValue(undefined),
    deleteQuest: jest.fn().mockResolvedValue(undefined),
  };
}

describe('mobile BoardScreen lanes', () => {
  beforeEach(setup);

  it('counts a mixed board and keeps each actionable quest in its own card', async () => {
    const oneTime = { ...habit, id: 'one-time', name: 'Today only', questType: 'one_time' as const, days: [], completed: true };
    mockStoreValue.user = { ...mockStoreValue.user, quests: [habit, oneTime] };
    const user = userEvent.setup();
    await render(<BoardScreen />);
    expect(screen.getByText('1/2')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Archive Daily habit' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Delete Daily habit' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Open Daily habit details' })).toBeOnTheScreen();
    await user.press(screen.getByRole('tab', { name: 'ONE TIME QUEST' }));
    expect(screen.getByRole('button', { name: 'Archive Today only' })).toBeOnTheScreen();
  });

  it('counts a one-time-only board', async () => {
    const oneTime = { ...habit, id: 'one-time', name: 'Today only', questType: 'one_time' as const, days: [], completed: true };
    mockStoreValue.user = { ...mockStoreValue.user, quests: [oneTime] };
    await render(<BoardScreen />);
    expect(screen.getByText('1/1')).toBeOnTheScreen();
  });

  it('keeps the note accessible independently from quest details', async () => {
    mockStoreValue.user = { ...mockStoreValue.user, quests: [{ ...habit, description: 'A longer note' }] };
    const user = userEvent.setup();
    await render(<BoardScreen />);
    await user.press(screen.getByRole('button', { name: 'Show note for Daily habit' }));
    expect(screen.getByRole('button', { name: 'Hide note for Daily habit' })).toBeOnTheScreen();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('disables repeated archive and delete actions while an archive is pending', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    mockStoreValue.archiveQuest.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    await render(<BoardScreen />);
    await user.press(screen.getByRole('button', { name: 'Archive Daily habit' }));
    expect(screen.getByRole('button', { name: 'Archive Daily habit' })).toBeDisabled();
    expect(screen.getByText('ARCHIVING…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Delete Daily habit' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Archive Daily habit' }));
    expect(mockStoreValue.archiveQuest).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    expect(screen.getByRole('button', { name: 'Archive Daily habit' })).toBeEnabled();
  });

  it('uses a phone lane selector to reach All Habits and Archived without hiding actions', async () => {
    const user = userEvent.setup();
    await render(<BoardScreen />);

    expect(screen.getByRole('tab', { name: 'DAILY QUEST' })).toBeOnTheScreen();
    expect(screen.getByText('Daily habit')).toBeOnTheScreen();
    expect(screen.queryByText('Off-day habit')).not.toBeOnTheScreen();

    await user.press(screen.getByRole('tab', { name: 'ALL HABITS' }));
    expect(screen.getByText('Off-day habit')).toBeOnTheScreen();
    expect(screen.queryByText('Archived habit')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Edit Off-day habit' })).toBeOnTheScreen();

    await user.press(screen.getByRole('tab', { name: 'ARCHIVED' }));
    expect(screen.getByText('Archived habit')).toBeOnTheScreen();
    expect(screen.queryByText('Off-day habit')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Edit Archived habit' })).toBeOnTheScreen();
  });

  it('requires a named retention confirmation before deleting an archived card', async () => {
    const user = userEvent.setup();
    const rendered = await render(<BoardScreen />);
    await user.press(screen.getByRole('tab', { name: 'ARCHIVED' }));
    await user.press(screen.getByRole('button', { name: 'Delete Archived habit' }));

    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    await act(async () => { fireEvent(rendered.getByTestId('board-delete-modal'), 'show'); });
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
    focus.mockRestore();

    expect(screen.getByText('DELETE Archived habit PERMANENTLY?')).toBeOnTheScreen();
    expect(screen.getByText(/History, Weekly Review, and earned XP remain/)).toBeOnTheScreen();
    expect(mockStoreValue.deleteQuest).not.toHaveBeenCalled();
    await act(async () => { rendered.getByTestId('board-delete-modal').props.onRequestClose(); });
    expect(mockStoreValue.deleteQuest).not.toHaveBeenCalled();
    await waitFor(() => expect(rendered.queryByTestId('board-delete-modal')).toBeNull());

    await user.press(screen.getByRole('button', { name: 'Delete Archived habit' }));
    await user.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
    expect(mockStoreValue.deleteQuest).toHaveBeenCalledTimes(1);
    expect(mockStoreValue.deleteQuest).toHaveBeenCalledWith('archived');
  });

  it('blocks Back and repeat confirmation while pending, then keeps an error for retry', async () => {
    const user = userEvent.setup();
    let rejectDelete!: (error: Error) => void;
    mockStoreValue.deleteQuest
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectDelete = reject; }))
      .mockResolvedValueOnce(undefined);
    const rendered = await render(<BoardScreen />);
    await user.press(screen.getByRole('tab', { name: 'ARCHIVED' }));
    await user.press(screen.getByRole('button', { name: 'Delete Archived habit' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm permanent delete' })).toBeDisabled());
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

  it('keeps saved quest rows visible with a friendly offline banner after a failed update', async () => {
    mockStoreValue.questsError = "You're offline. Your update wasn't saved. Your saved quests are still shown.";
    await render(<BoardScreen />);

    expect(screen.getByText('Daily habit')).toBeOnTheScreen();
    expect(screen.getByText(/You're offline/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Retry quests' })).toBeOnTheScreen();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });

  it('offers a full-page Retry state when a first quest load fails without cache', async () => {
    mockStoreValue.questsHaveCachedData = false;
    mockStoreValue.questsError = "You're offline. Your quests couldn't be loaded. Check your connection or retry.";
    await render(<BoardScreen />);

    expect(screen.getByText(/Couldn't load quests:/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Retry quests' })).toBeOnTheScreen();
    expect(screen.queryByText('Daily habit')).toBeNull();
  });

  it('lays out all four named lane tabs in a wrapping selector for narrow and large-text screens', async () => {
    await render(<BoardScreen />);
    const laneTabs = screen.getByTestId('board-lane-tabs');
    expect(laneTabs.props.horizontal).toBeUndefined();
    expect(laneTabs.props.style.flexWrap).toBe('wrap');
    for (const label of ['DAILY QUEST', 'ONE TIME QUEST', 'ALL HABITS', 'ARCHIVED']) {
      expect(screen.getByRole('tab', { name: label })).toBeOnTheScreen();
    }
  });

  it('consumes the one-time return intent once and opens the One Time lane', async () => {
    const oneTime = { ...habit, id: 'one-time', name: 'Created from Daily', questType: 'one_time' as const, days: [], dailyEligible: true };
    mockStoreValue.user = { ...mockStoreValue.user, quests: [habit, oneTime] };
    publishBoardReturnIntent('one-time');
    await render(<BoardScreen />);

    await act(async () => { mockFocusCallbacks[0]?.(); });
    expect(screen.getByRole('tab', { name: 'ONE TIME QUEST' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('Created from Daily')).toBeOnTheScreen();
    expect(consumeBoardReturnIntent()).toBeNull();
  });

  it('does not change a selected lane when an unrelated refresh adds a one-time quest', async () => {
    const rendered = await render(<BoardScreen />);
    mockStoreValue.user = { ...mockStoreValue.user, quests: [habit, { ...habit, id: 'remote-one-time', questType: 'one_time', days: [] }] };
    rendered.rerender(<BoardScreen />);
    expect(screen.getByRole('tab', { name: 'DAILY QUEST' }).props.accessibilityState).toMatchObject({ selected: true });
  });

  it('contains an 80-character profile name beside the rank badge', async () => {
    const longName = 'M'.repeat(80);
    mockStoreValue.user = { ...mockStoreValue.user, name: longName };
    await render(<BoardScreen />);

    const profileName = screen.getByTestId('board-profile-name');
    expect(profileName.props.children).toBe(longName);
    expect(profileName.props.numberOfLines).toBe(2);
    expect(profileName.props.ellipsizeMode).toBe('tail');
  });

  it('keeps both quest-type choices inside the chooser scroll viewport', async () => {
    const user = userEvent.setup();
    await render(<BoardScreen />);
    await user.press(screen.getByRole('button', { name: 'ADD A QUEST' }));

    expect(screen.getByTestId('board-type-chooser-scroll')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create a habit quest' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create a one-time quest' })).toBeOnTheScreen();
  });
});
