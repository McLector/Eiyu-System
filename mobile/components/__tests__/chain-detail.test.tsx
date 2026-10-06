import { act, screen, userEvent, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { initialUser, type LongQuest } from '@eiyu/shared';

import ChainDetailScreen from '../../app/(tabs)/chain/[id]';
import { renderWithTheme, TestThemeProvider } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockStore: any;
let mockFontScale = 1;
let mockParams: { id?: string } = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
const mockRouter = jest.requireMock('expo-router').router as { push: jest.Mock; back: jest.Mock };
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStore }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 800, scale: 2, fontScale: mockFontScale }),
}));

const stage = (id: string, name: string, done = false, description: string | null = null) => ({ id, name, done, description });
const chain = (over: Partial<LongQuest> = {}): LongQuest => ({
  id: 'lq-1', name: 'Launch the site', stat: 'INT', description: 'Why it matters', completedAt: null, createdAt: '2026-10-01T12:00:00Z',
  stages: [stage('s1', 'Plan', true, 'Sketch it'), stage('s2', 'Build', false, 'Write the code'), stage('s3', 'Ship')],
  ...over,
});

function setup(over: Record<string, unknown> = {}, quests: LongQuest[] = [chain()]) {
  mockRouter.push.mockClear();
  mockRouter.back.mockClear();
  mockParams = { id: 'lq-1' };
  mockFontScale = 1;
  mockStore = {
    user: { ...initialUser, timeZone: 'UTC', longQuests: quests },
    longQuestsLoading: false,
    longQuestsError: null,
    retryLongQuests: jest.fn(),
    toggleStage: jest.fn(),
    removeLongQuest: jest.fn().mockResolvedValue(undefined),
    pendingStageIds: [],
    rewardReceipt: null,
    stageRewardNotice: null,
    clearStageReward: jest.fn(),
    ...over,
  };
}
const open = (user: ReturnType<typeof userEvent.setup>, label: string) => user.press(screen.getByRole('button', { name: label }));

describe('Chain detail', () => {
  it('shows the stat, title, note, the stats grid and the percent', async () => {
    setup();
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByText('Launch the site')).toBeOnTheScreen();
    expect(screen.getByText('Why it matters')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Launch the site progress' })).toHaveProp('accessibilityValue', { min: 0, max: 100, now: 33 });
    const grid = screen.getByTestId('chain-stats');
    expect(within(grid).getByText('Stages')).toBeOnTheScreen();
    expect(within(grid).getByText('3')).toBeOnTheScreen();
    expect(within(grid).getByText('1')).toBeOnTheScreen();
    expect(within(grid).getByText('Finished')).toBeOnTheScreen();
    expect(within(grid).getByText('—')).toBeOnTheScreen();
    expect(within(grid).getByText('Thursday, Oct 1')).toBeOnTheScreen();
    expect(screen.getByText('33%')).toBeOnTheScreen();
  });

  it('labels stages Done, Current and Locked, and only the current one can be completed', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByTestId('stage-s1')).toHaveTextContent(/Done/);
    expect(screen.getByTestId('stage-s2')).toHaveTextContent(/Current/);
    expect(screen.getByTestId('stage-s3')).toHaveTextContent(/Locked/);
    expect(screen.getAllByRole('button', { name: 'COMPLETE STAGE' })).toHaveLength(1);
    expect(screen.getByText('Complete earlier stages first.')).toBeOnTheScreen();
    await open(user, 'COMPLETE STAGE');
    expect(mockStore.toggleStage).toHaveBeenCalledWith('lq-1', 's2');
  });

  it('disables COMPLETE STAGE while that stage is saving', async () => {
    setup({ pendingStageIds: ['s2'] });
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByRole('button', { name: 'COMPLETE STAGE' })).toBeDisabled();
  });

  it('opens the current stage details by default and toggles others from the stage menu', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByText('Write the code')).toBeOnTheScreen();
    expect(screen.queryByText('Sketch it')).toBeNull();
    await open(user, 'Actions for Plan');
    await user.press(screen.getByRole('menuitem', { name: 'Show details' }));
    expect(screen.getByText('Sketch it')).toBeOnTheScreen();
    await open(user, 'Actions for Build');
    await user.press(screen.getByRole('menuitem', { name: 'Hide details' }));
    expect(screen.queryByText('Write the code')).toBeNull();
  });

  const scrollPadding = () => StyleSheet.flatten(screen.getByTestId('chain-scroll').props.contentContainerStyle).paddingBottom;

  it('leaves only its own breathing room under the last stage: the tab bar is in the layout, not over it', async () => {
    setup();
    await renderWithTheme(<ChainDetailScreen />);
    expect(scrollPadding()).toBe(32);
  });

  it('pads the same at large font sizes', async () => {
    setup();
    mockFontScale = 1.3;
    await renderWithTheme(<ChainDetailScreen />);
    expect(scrollPadding()).toBe(32);
  });

  it('shows a stage description in full, with no line limit', async () => {
    const long = 'A long stage description that must never be cut short. '.repeat(10).trim();
    setup({}, [chain({ stages: [stage('s1', 'Plan', false, long), stage('s2', 'Build')] })]);
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByText(long)).not.toHaveProp('numberOfLines');
  });

  it('offers Mark not done only on the last finished stage', async () => {
    setup({}, [chain({ stages: [stage('s1', 'Plan', true), stage('s2', 'Build', true), stage('s3', 'Ship')] })]);
    const user = userEvent.setup();
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.queryByRole('button', { name: 'Actions for Plan' })).toBeNull();
    await open(user, 'Actions for Build');
    await user.press(screen.getByRole('menuitem', { name: 'Mark not done' }));
    expect(mockStore.toggleStage).toHaveBeenCalledWith('lq-1', 's2');
  });

  it('has no stage menu for a locked stage without a description', async () => {
    setup();
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.queryByRole('button', { name: 'Actions for Ship' })).toBeNull();
  });

  it('shows a long note clamped with Show more / Show less', async () => {
    setup({}, [chain({ description: 'x'.repeat(200) })]);
    const user = userEvent.setup();
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByText('x'.repeat(200))).toHaveProp('numberOfLines', 3);
    await open(user, 'Show more');
    expect(screen.getByText('x'.repeat(200))).not.toHaveProp('numberOfLines', 3);
    expect(screen.getByRole('button', { name: 'Show less' })).toBeOnTheScreen();
  });

  it('says so when the chain has no stages', async () => {
    setup({}, [chain({ stages: [] })]);
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByText('This chain has no stages yet. Edit it to add the first one.')).toBeOnTheScreen();
    expect(screen.getByText('0%')).toBeOnTheScreen();
  });

  it('edits through the overflow menu', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<ChainDetailScreen />);
    await open(user, 'More actions for Launch the site');
    await user.press(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/long-quest-editor', params: { id: 'lq-1' } });
  });

  it('deletes only after a confirmation, then leaves the screen', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<ChainDetailScreen />);
    await open(user, 'More actions for Launch the site');
    await user.press(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(mockStore.removeLongQuest).not.toHaveBeenCalled();
    expect(screen.getByText(/Delete Launch the site and its stages\? Earned XP remains\./)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Delete Long Quest' }));
    expect(mockStore.removeLongQuest).toHaveBeenCalledWith('lq-1');
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('cancelling the delete changes nothing', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<ChainDetailScreen />);
    await open(user, 'More actions for Launch the site');
    await user.press(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockStore.removeLongQuest).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('keeps the confirmation open and shows the reason when the delete fails', async () => {
    setup({ removeLongQuest: jest.fn().mockRejectedValue(new Error('Delete refused')) });
    const user = userEvent.setup();
    await renderWithTheme(<ChainDetailScreen />);
    await open(user, 'More actions for Launch the site');
    await user.press(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.press(screen.getByRole('button', { name: 'Delete Long Quest' }));
    expect(screen.getByText('Delete refused')).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete Long Quest' })).toBeEnabled();
  });

  it('shows the XP card with the stage notice (the card is the live region)', async () => {
    const receipt = { id: 'r1', stage_id: 's2', done: true, changed: true, replayed: false, components: [], totals: [{ stat: 'INT', before: 0, after: 20, delta: 20 }] };
    setup({ rewardReceipt: receipt, stageRewardNotice: 'Stage completed.' });
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByTestId('reward-feedback')).toBeOnTheScreen();
    expect(screen.getByText('Stage completed.')).toBeOnTheScreen();
    expect(screen.getByText('Stage completed.')).not.toHaveProp('accessibilityLiveRegion', 'polite');
  });

  it('announces a notice that has no reward card as a status', async () => {
    setup({ stageRewardNotice: 'Stage confirmed.' });
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByText('Stage confirmed.')).toHaveProp('accessibilityLiveRegion', 'polite');
  });

  it('shows a save failure from the store with a way to reload', async () => {
    setup({ longQuestsError: 'The save result is uncertain.' });
    const user = userEvent.setup();
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByText('The save result is uncertain.')).toBeOnTheScreen();
    await open(user, 'Retry');
    expect(mockStore.retryLongQuests).toHaveBeenCalled();
  });

  it('clears the reward card when the screen is left', async () => {
    setup();
    const view = await renderWithTheme(<ChainDetailScreen />);
    await act(async () => { view.unmount(); });
    expect(mockStore.clearStageReward).toHaveBeenCalled();
  });

  it('shows a calm empty state, not a crash, when the chain no longer exists', async () => {
    setup({}, []);
    const user = userEvent.setup();
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByText('CHAIN NOT FOUND')).toBeOnTheScreen();
    await open(user, 'Back to chains');
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('waits for the first read instead of calling the chain missing', async () => {
    setup({ longQuestsLoading: true }, []);
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.queryByText('CHAIN NOT FOUND')).toBeNull();
    expect(screen.getByText('Reading your quest log…')).toBeOnTheScreen();
  });

  it('goes back from the header', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<ChainDetailScreen />);
    await open(user, 'Back to chains');
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('keeps working when re-rendered with new data (a stage completes)', async () => {
    setup();
    const view = await renderWithTheme(<ChainDetailScreen />);
    mockStore = { ...mockStore, user: { ...mockStore.user, longQuests: [chain({ stages: [stage('s1', 'Plan', true), stage('s2', 'Build', true), stage('s3', 'Ship')] })] } };
    await view.rerender(<TestThemeProvider><ChainDetailScreen /></TestThemeProvider>);
    expect(screen.getByTestId('stage-s3')).toHaveTextContent(/Current/);
    expect(screen.getByText('67%')).toBeOnTheScreen();
  });
});
