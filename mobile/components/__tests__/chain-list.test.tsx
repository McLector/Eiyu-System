import { screen, userEvent } from '@testing-library/react-native';
import { initialUser, LONG_QUEST_COPY, type LongQuest } from '@eiyu/shared';

import ChainListScreen from '../../app/(tabs)/chain/index';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockStore: any;
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
const mockRouter = jest.requireMock('expo-router').router as { push: jest.Mock };
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStore }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const chain = (over: Partial<LongQuest> = {}): LongQuest => ({
  id: 'lq-1', name: 'Launch the site', stat: 'INT', description: null, completedAt: null, createdAt: '2026-10-01T00:00:00Z',
  stages: [
    { id: 's1', name: 'Plan', done: true, description: null },
    { id: 's2', name: 'Build', done: false, description: null },
    { id: 's3', name: 'Ship', done: false, description: null },
  ],
  ...over,
});

function setup(over: Record<string, unknown> = {}, quests: LongQuest[] = [chain()]) {
  mockRouter.push.mockClear();
  mockStore = {
    user: { ...initialUser, timeZone: 'UTC', longQuests: quests },
    longQuestsLoading: false,
    longQuestsError: null,
    retryLongQuests: jest.fn(),
    ...over,
  };
}

describe('Chain list', () => {
  it('shows each chain with its stat, done/total and a progress bar', async () => {
    setup({}, [chain(), chain({ id: 'lq-2', name: 'Run a 10k', stat: 'STR', stages: [{ id: 'a', name: 'Jog', done: false, description: null }] })]);
    await renderWithTheme(<ChainListScreen />);
    expect(screen.getByText('Launch the site')).toBeOnTheScreen();
    expect(screen.getByText('1/3')).toBeOnTheScreen();
    expect(screen.getByText('0/1')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Launch the site progress' })).toHaveProp('accessibilityValue', { min: 0, max: 100, now: 33 });
    expect(screen.getByText('INT')).toBeOnTheScreen();
  });

  it('opens the chain on its own screen when a card is pressed', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<ChainListScreen />);
    await user.press(screen.getByRole('button', { name: /Launch the site/ }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/chain/[id]', params: { id: 'lq-1' } });
  });

  it('starts a new chain in the editor', async () => {
    setup();
    const user = userEvent.setup();
    await renderWithTheme(<ChainListScreen />);
    await user.press(screen.getByRole('button', { name: 'NEW CHAIN' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/long-quest-editor');
  });

  it('shows the empty copy, and NEW CHAIN is still there', async () => {
    setup({}, []);
    await renderWithTheme(<ChainListScreen />);
    expect(screen.getByText(LONG_QUEST_COPY.emptyTitle)).toBeOnTheScreen();
    expect(screen.getByText(LONG_QUEST_COPY.empty)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'NEW CHAIN' })).toBeOnTheScreen();
  });

  it('shows a loading state while the first read runs', async () => {
    setup({ longQuestsLoading: true }, []);
    await renderWithTheme(<ChainListScreen />);
    expect(screen.getByText('Reading your quest log…')).toBeOnTheScreen();
    expect(screen.queryByText(LONG_QUEST_COPY.emptyTitle)).toBeNull();
  });

  it('offers Retry when the first read fails, and calls retry', async () => {
    setup({ longQuestsError: 'Network request failed' }, []);
    const user = userEvent.setup();
    await renderWithTheme(<ChainListScreen />);
    expect(screen.getByText('Network request failed')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Retry' }));
    expect(mockStore.retryLongQuests).toHaveBeenCalledTimes(1);
  });

  it('keeps the chains visible when a later refresh fails', async () => {
    setup({ longQuestsError: 'Offline' });
    await renderWithTheme(<ChainListScreen />);
    expect(screen.getByText('Launch the site')).toBeOnTheScreen();
    expect(screen.getByText('Offline')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeOnTheScreen();
  });

  it('reads 0/0 and 0% for a chain without stages instead of NaN', async () => {
    setup({}, [chain({ stages: [] })]);
    await renderWithTheme(<ChainListScreen />);
    expect(screen.getByText('0/0')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Launch the site progress' })).toHaveProp('accessibilityValue', { min: 0, max: 100, now: 0 });
  });

  it('has no Suggest Stages control and no old Long Quests copy', async () => {
    setup();
    await renderWithTheme(<ChainListScreen />);
    expect(screen.queryByText(/suggest stages/i)).toBeNull();
    expect(screen.queryByText('ADD A LONG QUEST')).toBeNull();
  });
});
