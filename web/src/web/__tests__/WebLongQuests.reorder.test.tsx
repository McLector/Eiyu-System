// @vitest-environment jsdom

import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type LongQuest } from '@eiyu/shared';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn(), reorderChains: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebLongQuests from '../WebLongQuests';
import { NavigationGuard } from '../../components/NavigationGuard';
import { CHAIN_DRAG_TYPE } from '../lane-drag';

afterEach(cleanup);

const chain = (id: string, position?: number, done = false): LongQuest => ({
  id, name: id.toUpperCase(), stat: 'INT', description: null, completedAt: null, position,
  stages: [{ id: `${id}-1`, name: 'Stage', done, description: null }, { id: `${id}-2`, name: 'Stage two', done, description: null }],
});

function setup(chains: LongQuest[]) {
  store.reorderChains.mockReset().mockResolvedValue(undefined);
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', longQuests: chains }, stageRewardNotice: null, rewardReceipt: null,
    longQuestsLoading: false, longQuestsError: null, retryLongQuests: vi.fn(), toggleStage: vi.fn(),
    removeLongQuest: vi.fn(), saveLongQuest: vi.fn(), pendingStageIds: [], reorderChains: store.reorderChains,
  });
  render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <NavigationGuard><WebLongQuests /></NavigationGuard> }])} />);
}
const nav = () => screen.getByRole('navigation', { name: 'Your chains' });
const names = () => within(nav()).getAllByRole('button').filter(b => b.classList.contains('chain-nav-item')).map(b => b.querySelector('.chain-nav-name')?.textContent);
const menuFor = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(within(nav()).getByRole('button', { name: `More actions for ${name}` }));
};
const row = (id: string) => nav().querySelector(`[data-item-id="${id}"]`) as HTMLElement;

describe('Chain list manual order', () => {
  beforeEach(() => { Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true, writable: true }); });

  it('lists chains by position, with finished chains at the bottom', () => {
    setup([chain('done', 0, true), chain('b', 2), chain('a', 1)]);
    expect(names()).toEqual(['A', 'B', 'DONE']);
  });

  it('opens the first chain in that order', () => {
    setup([chain('b', 1), chain('a', 0)]);
    expect(document.querySelector('.chain-panel .chain-title')).toHaveTextContent('A');
  });

  it('keeps the fetched order, with no controls, until every chain has a position', async () => {
    const user = userEvent.setup();
    setup([chain('b'), chain('a', 0), chain('done', undefined, true)]);
    expect(names()).toEqual(['B', 'A', 'DONE']);
    expect(nav().querySelector('.chain-nav-grip')).toBeNull();
    expect(within(nav()).queryByRole('button', { name: /More actions for/ })).toBeNull();
    void user;
  });

  it('moves a chain up, to the top and down by sending the unfinished chains in their new order', async () => {
    const user = userEvent.setup();
    setup([chain('a', 0), chain('done', 1, true), chain('b', 2), chain('c', 3)]);
    await menuFor(user, 'B');
    await user.click(screen.getByRole('menuitem', { name: 'Move B up' }));
    expect(store.reorderChains).toHaveBeenLastCalledWith(['b', 'a', 'c']);
    await menuFor(user, 'C');
    await user.click(screen.getByRole('menuitem', { name: 'Move C to top' }));
    expect(store.reorderChains).toHaveBeenLastCalledWith(['c', 'a', 'b']);
    await menuFor(user, 'A');
    await user.click(screen.getByRole('menuitem', { name: 'Move A down' }));
    expect(store.reorderChains).toHaveBeenLastCalledWith(['b', 'a', 'c']);
  });

  it('disables moves that go nowhere, counting only unfinished chains', async () => {
    const user = userEvent.setup();
    setup([chain('done', -1, true), chain('a', 0), chain('b', 1)]);
    await menuFor(user, 'A');
    expect(screen.getByRole('menuitem', { name: 'Move A up' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Move A to top' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Move A down' })).toBeEnabled();
  });

  it('gives a finished chain no grip and no actions', () => {
    setup([chain('a', 0), chain('done', 1, true)]);
    expect(row('done').querySelector('.chain-nav-grip')).toBeNull();
    expect(within(row('done')).queryByRole('button', { name: /More actions for/ })).toBeNull();
    expect(row('a').querySelector('.chain-nav-grip')).not.toBeNull();
  });

  it('still selects a chain by pressing its name', async () => {
    const user = userEvent.setup();
    setup([chain('a', 0), chain('b', 1)]);
    await user.click(within(nav()).getByRole('button', { name: /^B/ }));
    expect(document.querySelector('.chain-panel .chain-title')).toHaveTextContent('B');
  });

  describe('dragging a grip', () => {
    const transfer = (id: string) => {
      const bag = new Map<string, string>([[CHAIN_DRAG_TYPE, JSON.stringify({ id })]]);
      return { types: [CHAIN_DRAG_TYPE], getData: (t: string) => bag.get(t) ?? '', setData: (t: string, v: string) => { bag.set(t, v); }, effectAllowed: 'none', dropEffect: 'none', setDragImage: vi.fn() };
    };
    const dropOn = (id: string, clientY: number, dataTransfer: unknown) => {
      const target = row(id);
      vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 100, height: 40, bottom: 140, left: 0, right: 100, width: 100, x: 0, y: 100, toJSON: () => ({}) });
      const event = createEvent.drop(target, { dataTransfer });
      Object.defineProperty(event, 'clientY', { value: clientY });
      fireEvent(target, event);
    };

    it('drops before or after another chain', () => {
      setup([chain('a', 0), chain('b', 1), chain('c', 2)]);
      const grip = row('c').querySelector('.chain-nav-grip') as HTMLElement;
      const dataTransfer = transfer('c');
      fireEvent.dragStart(grip, { dataTransfer });
      dropOn('a', 105, dataTransfer);
      expect(store.reorderChains).toHaveBeenLastCalledWith(['c', 'a', 'b']);
      // A drop ends the drag, so the next move starts a new one.
      fireEvent.dragStart(grip, { dataTransfer });
      dropOn('a', 135, dataTransfer);
      expect(store.reorderChains).toHaveBeenLastCalledWith(['a', 'c', 'b']);
    });

    it('ignores a drop on itself, on a finished chain, or of a quest card', () => {
      setup([chain('a', 0), chain('b', 1), chain('done', 2, true)]);
      const dataTransfer = transfer('a');
      fireEvent.dragStart(row('a').querySelector('.chain-nav-grip') as HTMLElement, { dataTransfer });
      dropOn('a', 105, dataTransfer);
      dropOn('done', 105, dataTransfer);
      const quest = { types: ['application/x-eiyu-quest'], getData: () => JSON.stringify({ id: 'b', from: 'backlog' }), dropEffect: 'none' };
      dropOn('a', 105, quest);
      expect(store.reorderChains).not.toHaveBeenCalled();
    });
  });
});
