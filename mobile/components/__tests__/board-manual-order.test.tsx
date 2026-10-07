import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import { PanResponder } from 'react-native';
import type { Quest, UserProfile } from '@eiyu/shared';
import { initialUser } from '@eiyu/shared';

import BoardScreen from '../../app/(tabs)/board';
import { consumeBoardReturnIntent } from '../../lib/board-return-intent';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockStoreValue: any;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), setParams: jest.fn() },
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStoreValue }));
jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const habit = (id: string, position?: number, over: Partial<Quest> = {}): Quest => ({
  id, name: id.toUpperCase(), stat: 'STR', difficulty: 'Medium', easyVersion: 'One minute', description: null, questType: 'habit',
  archived: false, time: '08:00', days: [1, 3, 5], streak: 0, frozen: false, dailyEligible: true, completed: false,
  targetCount: null, progressCount: 0, position, ...over,
});
const oneTime = (id: string, position?: number, over: Partial<Quest> = {}): Quest => habit(id, position, { questType: 'one_time', days: [], easyVersion: null, timeSet: false, scheduledDate: null, ...over });
const idea = (id: string, position?: number): Quest => habit(id, position, { questType: 'backlog', days: [], easyVersion: null, dailyEligible: false, timeSet: false });

function setup(quests: Quest[], backlog: Quest[] = []) {
  consumeBoardReturnIntent();
  const user: UserProfile = { ...initialUser, timeZone: 'UTC', rank: 'E', quests, longQuests: [] };
  mockStoreValue = {
    user, backlog, questsLoading: false, questsError: null, questsHaveCachedData: true, retryQuests: jest.fn(),
    toggleQuest: jest.fn(), adjustProgress: jest.fn(), completeRecovery: jest.fn(), reminderWarning: null, retryReminders: jest.fn(),
    syncStates: new Map(), syncWaiting: 0, syncOffline: false, failedSyncs: [], retrySync: jest.fn(), dismissSync: jest.fn(),
    archiveQuest: jest.fn().mockResolvedValue(undefined), restoreQuest: jest.fn().mockResolvedValue(undefined),
    deleteQuest: jest.fn().mockResolvedValue(undefined), moveToOneTime: jest.fn().mockResolvedValue(undefined),
    moveToBacklog: jest.fn().mockResolvedValue(undefined), reorderQuests: jest.fn().mockResolvedValue(undefined),
  };
}
const board = () => renderWithTheme(<BoardScreen />);
const openActions = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.press(screen.getByRole('button', { name: `More actions for ${name}` }));
};
const choose = async (user: ReturnType<typeof userEvent.setup>, action: string) => {
  await user.press(screen.getByRole('menuitem', { name: action }));
};

describe('mobile Board manual order', () => {
  beforeEach(() => jest.clearAllMocks());

  it('moves a Daily quest up by sending the whole unfinished lane in its new order', async () => {
    setup([habit('a', 0), habit('b', 1), habit('c', 2)]);
    const user = userEvent.setup();
    await board();
    await openActions(user, 'B');
    await choose(user, 'Move up');
    expect(mockStoreValue.reorderQuests).toHaveBeenCalledWith('habit', ['b', 'a', 'c']);
  });

  it('moves a quest to the top and down', async () => {
    setup([habit('a', 0), habit('b', 1), habit('c', 2)]);
    const user = userEvent.setup();
    await board();
    await openActions(user, 'C');
    await choose(user, 'Move to top');
    expect(mockStoreValue.reorderQuests).toHaveBeenLastCalledWith('habit', ['c', 'a', 'b']);
    await openActions(user, 'A');
    await choose(user, 'Move down');
    expect(mockStoreValue.reorderQuests).toHaveBeenLastCalledWith('habit', ['b', 'a', 'c']);
  });

  it('counts only unfinished quests: Move up is disabled on the first of them even with a finished one stored above', async () => {
    setup([habit('done', -1, { completed: true }), habit('a', 0), habit('b', 1)]);
    const user = userEvent.setup();
    await board();
    await openActions(user, 'A');
    expect(screen.getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Move to top' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Move down' })).toBeEnabled();
  });

  it('offers a finished quest no reorder items and no grip', async () => {
    setup([habit('a', 0), habit('b', 1), habit('done', 2, { completed: true })]);
    const user = userEvent.setup();
    await board();
    expect(screen.queryByTestId('reorder-grip-done')).toBeNull();
    expect(screen.getByTestId('reorder-grip-a')).toBeOnTheScreen();
    await openActions(user, 'DONE');
    expect(screen.queryByRole('menuitem', { name: 'Move up' })).toBeNull();
  });

  it('shows no grips and no reorder items while any quest in a lane lacks a position (a database before 044)', async () => {
    setup([habit('a', 0), habit('b'), habit('c', 2)]);
    const user = userEvent.setup();
    await board();
    expect(screen.queryByTestId('reorder-grip-a')).toBeNull();
    await openActions(user, 'A');
    expect(screen.queryByRole('menuitem', { name: 'Move up' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Edit quest' })).toBeOnTheScreen();
  });

  it('reorders the One-time and Backlog lanes under their own lane names', async () => {
    setup([oneTime('t1', 0), oneTime('t2', 1)], [idea('i1', 0), idea('i2', 1)]);
    const user = userEvent.setup();
    await board();
    await user.press(screen.getByRole('tab', { name: 'ONE TIME QUEST' }));
    await openActions(user, 'T2');
    await choose(user, 'Move up');
    expect(mockStoreValue.reorderQuests).toHaveBeenLastCalledWith('one_time', ['t2', 't1']);
    await user.press(screen.getByRole('tab', { name: 'BACKLOG' }));
    await openActions(user, 'I1');
    await choose(user, 'Move down');
    expect(mockStoreValue.reorderQuests).toHaveBeenLastCalledWith('backlog', ['i2', 'i1']);
  });

  it('moves a row from its grip with the accessibility actions', async () => {
    setup([habit('a', 0), habit('b', 1), habit('c', 2)]);
    await board();
    await act(async () => {
      screen.getByTestId('reorder-grip-a').props.onAccessibilityAction({ nativeEvent: { actionName: 'moveDown' } });
    });
    expect(mockStoreValue.reorderQuests).toHaveBeenCalledWith('habit', ['b', 'a', 'c']);
  });

  it('still lets a lane move happen from the same sheet', async () => {
    setup([], [idea('i1', 0), idea('i2', 1)]);
    const user = userEvent.setup();
    await board();
    await user.press(screen.getByRole('tab', { name: 'BACKLOG' }));
    await openActions(user, 'I1');
    await choose(user, 'Move to One-time');
    expect(mockStoreValue.moveToOneTime).toHaveBeenCalledWith('i1');
  });

  it('does not let the board crash when the save is refused', async () => {
    setup([habit('a', 0), habit('b', 1)]);
    mockStoreValue.reorderQuests.mockRejectedValueOnce(new Error('Quest order is out of date. Reload and try again.'));
    const user = userEvent.setup();
    await board();
    await openActions(user, 'B');
    await choose(user, 'Move up');
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('button', { name: 'More actions for B' })).toBeOnTheScreen();
  });

  it('holds the lane and the pager still while a grip is being dragged', async () => {
    jest.spyOn(PanResponder, 'create').mockImplementation(config => ({
      panHandlers: {
        onResponderGrant: config.onPanResponderGrant,
        onResponderRelease: config.onPanResponderRelease,
        onResponderTerminate: config.onPanResponderTerminate,
      },
    } as unknown as ReturnType<typeof PanResponder.create>));
    setup([habit('a', 0), habit('b', 1)]);
    await board();
    expect(screen.getByTestId('board-pager')).not.toHaveProp('scrollEnabled', false);
    await act(async () => { screen.getByTestId('reorder-grip-a').props.onResponderGrant(); });
    expect(screen.getByTestId('board-pager')).toHaveProp('scrollEnabled', false);
    expect(screen.getByTestId('board-lane-scroll-daily')).toHaveProp('scrollEnabled', false);
    await act(async () => { screen.getByTestId('reorder-grip-a').props.onResponderRelease({}, { dy: 0 }); });
    expect(screen.getByTestId('board-pager')).not.toHaveProp('scrollEnabled', false);
    expect(screen.getByTestId('board-lane-scroll-daily')).not.toHaveProp('scrollEnabled', false);
    jest.restoreAllMocks();
  });
});

void fireEvent;
