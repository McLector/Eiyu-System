import { act, screen, userEvent } from '@testing-library/react-native';
import { initialUser, type LongQuest } from '@eiyu/shared';

import ChainListScreen from '../../app/(tabs)/chain/index';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockStore: any;
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
const mockRouter = jest.requireMock('expo-router').router as { push: jest.Mock };
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStore }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const chain = (id: string, position?: number, done = false): LongQuest => ({
  id, name: id.toUpperCase(), stat: 'INT', description: null, completedAt: null, position,
  stages: [{ id: `${id}-1`, name: 'One', done, description: null }, { id: `${id}-2`, name: 'Two', done, description: null }],
});

function setup(chains: LongQuest[]) {
  mockRouter.push.mockClear();
  mockStore = {
    user: { ...initialUser, timeZone: 'UTC', longQuests: chains },
    longQuestsLoading: false, longQuestsError: null, retryLongQuests: jest.fn(), reorderChains: jest.fn().mockResolvedValue(undefined),
  };
}
const names = () => screen.getAllByTestId('chain-card').map(card => card.props.accessibilityLabel.split(',')[0]);
const openActions = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.press(screen.getByRole('button', { name: `More actions for ${name}` }));
};
const choose = async (user: ReturnType<typeof userEvent.setup>, action: string) => {
  await user.press(screen.getByRole('menuitem', { name: action }));
};

describe('Chain list manual order', () => {
  it('lists chains by position with finished chains at the bottom', async () => {
    setup([chain('done', 0, true), chain('b', 2), chain('a', 1)]);
    await renderWithTheme(<ChainListScreen />);
    expect(names()).toEqual(['A', 'B', 'DONE']);
  });

  it('keeps the fetched order, with no controls, until every chain has a position', async () => {
    setup([chain('b'), chain('a', 0), chain('done', undefined, true)]);
    await renderWithTheme(<ChainListScreen />);
    expect(names()).toEqual(['B', 'A', 'DONE']);
    expect(screen.queryByTestId('reorder-grip-a')).toBeNull();
    expect(screen.queryByRole('button', { name: /More actions for/ })).toBeNull();
  });

  it('moves a chain up, to the top and down by sending the unfinished chains in their new order', async () => {
    setup([chain('a', 0), chain('done', 1, true), chain('b', 2), chain('c', 3)]);
    const user = userEvent.setup();
    await renderWithTheme(<ChainListScreen />);
    await openActions(user, 'B');
    await choose(user, 'Move up');
    expect(mockStore.reorderChains).toHaveBeenLastCalledWith(['b', 'a', 'c']);
    await openActions(user, 'C');
    await choose(user, 'Move to top');
    expect(mockStore.reorderChains).toHaveBeenLastCalledWith(['c', 'a', 'b']);
    await openActions(user, 'A');
    await choose(user, 'Move down');
    expect(mockStore.reorderChains).toHaveBeenLastCalledWith(['b', 'a', 'c']);
  });

  it('disables moves that go nowhere, counting only unfinished chains', async () => {
    setup([chain('done', -1, true), chain('a', 0), chain('b', 1)]);
    const user = userEvent.setup();
    await renderWithTheme(<ChainListScreen />);
    await openActions(user, 'A');
    expect(screen.getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Move to top' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Move down' })).toBeEnabled();
  });

  it('gives a finished chain no grip and no actions', async () => {
    setup([chain('a', 0), chain('b', 1), chain('done', 2, true)]);
    await renderWithTheme(<ChainListScreen />);
    expect(screen.queryByTestId('reorder-grip-done')).toBeNull();
    expect(screen.queryByRole('button', { name: 'More actions for DONE' })).toBeNull();
    expect(screen.getByTestId('reorder-grip-a')).toBeOnTheScreen();
  });

  it('moves a chain from its grip with the accessibility actions', async () => {
    setup([chain('a', 0), chain('b', 1)]);
    await renderWithTheme(<ChainListScreen />);
    await act(async () => {
      screen.getByTestId('reorder-grip-b').props.onAccessibilityAction({ nativeEvent: { actionName: 'moveUp' } });
    });
    expect(mockStore.reorderChains).toHaveBeenCalledWith(['b', 'a']);
  });

  it('still opens a chain when its card is pressed', async () => {
    setup([chain('a', 0), chain('b', 1)]);
    const user = userEvent.setup();
    await renderWithTheme(<ChainListScreen />);
    await user.press(screen.getByRole('button', { name: /^B, 0 of 2/ }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/chain/[id]', params: { id: 'b' } });
  });

  it('does not crash when the save is refused', async () => {
    setup([chain('a', 0), chain('b', 1)]);
    mockStore.reorderChains.mockRejectedValueOnce(new Error('Quest order is out of date. Reload and try again.'));
    const user = userEvent.setup();
    await renderWithTheme(<ChainListScreen />);
    await openActions(user, 'B');
    await choose(user, 'Move up');
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('button', { name: 'More actions for B' })).toBeOnTheScreen();
  });
});
