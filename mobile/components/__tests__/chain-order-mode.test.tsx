import { screen, userEvent, within } from '@testing-library/react-native';
import { initialUser, type LongQuest } from '@eiyu/shared';

import ChainDetailScreen from '../../app/(tabs)/chain/[id]';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockStore: any;
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'lq-1' }),
}));
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStore }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const stage = (id: string, name: string, done = false, description: string | null = null) => ({ id, name, done, description });
const chain = (over: Partial<LongQuest> = {}): LongQuest => ({
  id: 'lq-1', name: 'Launch the site', stat: 'INT', description: null, completedAt: null, createdAt: '2026-10-01T12:00:00Z',
  stages: [stage('s1', 'Plan', true, 'Sketch it'), stage('s2', 'Build', false, 'Write the code'), stage('s3', 'Ship', false, 'Behind the door')],
  ...over,
});

function setup(quest: LongQuest, over: Record<string, unknown> = {}) {
  mockStore = {
    user: { ...initialUser, timeZone: 'UTC', longQuests: [quest] },
    longQuestsLoading: false, longQuestsError: null, retryLongQuests: jest.fn(), toggleStage: jest.fn(),
    removeLongQuest: jest.fn().mockResolvedValue(undefined), pendingStageIds: [], rewardReceipt: null,
    stageRewardNotice: null, clearStageReward: jest.fn(), ...over,
  };
}
const press = (user: ReturnType<typeof userEvent.setup>, label: string) => user.press(screen.getByRole('button', { name: label }));

describe('Chain detail: a chain done in any order', () => {
  it('labels unfinished stages Open, never Locked, and gives no reason to wait', async () => {
    setup(chain({ strictOrder: false }));
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByTestId('stage-s1')).toHaveTextContent(/Done/);
    expect(screen.getByTestId('stage-s2')).toHaveTextContent(/Open/);
    expect(screen.getByTestId('stage-s3')).toHaveTextContent(/Open/);
    expect(screen.queryByText(/Locked/)).toBeNull();
    expect(screen.queryByText('Complete earlier stages first.')).toBeNull();
  });

  it('offers a named COMPLETE STAGE on every open stage, and a later stage can be completed first', async () => {
    setup(chain({ strictOrder: false }));
    const user = userEvent.setup();
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByTestId('stage-complete-s2')).toBeOnTheScreen();
    expect(screen.getByTestId('stage-complete-s3')).toBeOnTheScreen();
    expect(screen.queryByTestId('stage-complete')).toBeNull();
    await press(user, 'COMPLETE STAGE: Ship');
    expect(mockStore.toggleStage).toHaveBeenCalledWith('lq-1', 's3');
  });

  it('disables only the stage that is saving', async () => {
    setup(chain({ strictOrder: false }), { pendingStageIds: ['s3'] });
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByRole('button', { name: 'COMPLETE STAGE: Ship' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'COMPLETE STAGE: Build' })).toBeEnabled();
  });

  it('lets any finished stage be marked not done, even with a later one done', async () => {
    setup(chain({ strictOrder: false, stages: [stage('s1', 'Plan', true), stage('s2', 'Build', true), stage('s3', 'Ship')] }));
    const user = userEvent.setup();
    await renderWithTheme(<ChainDetailScreen />);
    await press(user, 'Actions for Plan');
    await user.press(screen.getByRole('menuitem', { name: 'Mark not done' }));
    expect(mockStore.toggleStage).toHaveBeenCalledWith('lq-1', 's1');
  });

  it('opens the first open stage details by default and keeps the others closed', async () => {
    setup(chain({ strictOrder: false }));
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByText('Write the code')).toBeOnTheScreen();
    expect(screen.queryByText('Behind the door')).toBeNull();
  });

  it('offers no COMPLETE STAGE once every stage is done', async () => {
    setup(chain({ strictOrder: false, completedAt: '2026-10-02T10:00:00Z', stages: [stage('s1', 'Plan', true), stage('s2', 'Build', true)] }));
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.queryByRole('button', { name: /COMPLETE STAGE/ })).toBeNull();
  });
});

describe('Chain detail: a chain done in order', () => {
  it.each([[true], [undefined]])('keeps Current and Locked when strictOrder is %s', async strictOrder => {
    setup(chain({ strictOrder }));
    await renderWithTheme(<ChainDetailScreen />);
    expect(screen.getByTestId('stage-s2')).toHaveTextContent(/Current/);
    expect(screen.getByTestId('stage-s3')).toHaveTextContent(/Locked/);
    expect(screen.getByTestId('stage-complete')).toBeOnTheScreen();
  });
});

describe('Chain detail: the Order stat', () => {
  it.each([[false, 'Any order'], [true, 'In order'], [undefined, 'In order']])('reads %s as %s', async (strictOrder, text) => {
    setup(chain({ strictOrder }));
    await renderWithTheme(<ChainDetailScreen />);
    const grid = screen.getByTestId('chain-stats');
    expect(within(grid).getByText('Order')).toBeOnTheScreen();
    expect(within(grid).getByText(text)).toBeOnTheScreen();
  });
});
