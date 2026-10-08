// @vitest-environment jsdom

import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type Quest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebBoard from '../WebBoard';
import { QUEST_DRAG_TYPE } from '../lane-drag';

afterEach(cleanup);

const base: Quest = {
  id: 'h1', name: 'Walk', stat: 'STR', difficulty: 'Medium', easyVersion: 'One minute', description: null,
  questType: 'habit', archived: false, time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0,
  frozen: false, dailyEligible: true, completed: false, targetCount: null, progressCount: 0,
};
const habit = (id: string, position?: number, over: Partial<Quest> = {}): Quest => ({ ...base, id, name: id.toUpperCase(), position, ...over });
const oneTime = (id: string, position?: number, over: Partial<Quest> = {}): Quest => ({ ...base, id, name: id.toUpperCase(), position, questType: 'one_time', days: [], easyVersion: null, timeSet: false, scheduledDate: null, ...over });
const idea = (id: string, position?: number, over: Partial<Quest> = {}): Quest => ({ ...base, id, name: id.toUpperCase(), position, questType: 'backlog', days: [], easyVersion: null, timeSet: false, dailyEligible: false, ...over });

function renderBoard(quests: Quest[], backlog: Quest[] = []) {
  const reorderQuests = vi.fn().mockResolvedValue(undefined);
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests, longQuests: [] }, backlog,
    questsLoading: false, questsError: null, retryQuests: vi.fn(), toggleQuest: vi.fn(), adjustProgress: vi.fn(),
    completeRecovery: vi.fn(), archiveQuest: vi.fn(), restoreQuest: vi.fn(), deleteQuest: vi.fn(),
    moveToOneTime: vi.fn().mockResolvedValue(undefined), moveToBacklog: vi.fn().mockResolvedValue(undefined), reorderQuests,
  });
  render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
  return { reorderQuests };
}
const lane = (name: string) => screen.getByRole('region', { name });
const menuFor = async (user: ReturnType<typeof userEvent.setup>, laneName: string, name: string) => {
  await user.click(within(lane(laneName)).getByRole('button', { name: `More actions for ${name}` }));
  return screen.getByRole('menu');
};
const transfer = (payload: unknown) => {
  const bag = new Map<string, string>();
  bag.set(QUEST_DRAG_TYPE, JSON.stringify(payload));
  return { types: [QUEST_DRAG_TYPE], getData: (t: string) => bag.get(t) ?? '', setData: (t: string, v: string) => { bag.set(t, v); }, effectAllowed: 'none', dropEffect: 'none', setDragImage: vi.fn() };
};
const card = (id: string) => screen.getByTestId(`quest-card-${id}`);
const dropOnCard = (id: string, clientY: number, dataTransfer: unknown) => {
  const target = card(id);
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 100, height: 40, bottom: 140, left: 0, right: 100, width: 100, x: 0, y: 100, toJSON: () => ({}) });
  const event = createEvent.drop(target, { dataTransfer });
  Object.defineProperty(event, 'clientY', { value: clientY });
  fireEvent(target, event);
};

describe('manual order on the board', () => {
  beforeEach(() => store.useEiyu.mockReset());

  it('moves a Daily quest up by sending the whole unfinished lane in its new order', async () => {
    const user = userEvent.setup();
    const { reorderQuests } = renderBoard([habit('a', 0), habit('b', 1), habit('c', 2)]);
    await menuFor(user, 'Daily Quest', 'A');
    expect(screen.getByRole('menuitem', { name: 'Move A up' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await menuFor(user, 'Daily Quest', 'B');
    await user.click(screen.getByRole('menuitem', { name: 'Move B up' }));
    expect(reorderQuests).toHaveBeenCalledWith('habit', ['b', 'a', 'c']);
  });

  it('moves to the top and down, over the whole lane and not just the visible page', async () => {
    const user = userEvent.setup();
    const { reorderQuests } = renderBoard(['a', 'b', 'c', 'd', 'e'].map((id, i) => habit(id, i)));
    await menuFor(user, 'Daily Quest', 'A');
    await user.click(screen.getByRole('menuitem', { name: 'Move A down' }));
    expect(reorderQuests).toHaveBeenLastCalledWith('habit', ['b', 'a', 'c', 'd', 'e']);
    await menuFor(user, 'Daily Quest', 'B');
    await user.click(screen.getByRole('menuitem', { name: 'Move B to top' }));
    expect(reorderQuests).toHaveBeenLastCalledWith('habit', ['b', 'a', 'c', 'd', 'e']);
  });

  it('counts only unfinished quests, so Move up is disabled on the first of them even with finished ones stored above', async () => {
    const user = userEvent.setup();
    // The finished quest holds position -1 but is shown last; A is the first quest that can move.
    renderBoard([habit('done', -1, { completed: true }), habit('a', 0), habit('b', 1)]);
    await menuFor(user, 'Daily Quest', 'A');
    expect(screen.getByRole('menuitem', { name: 'Move A up' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Move A to top' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Move A down' })).toBeEnabled();
  });

  it('gives a finished quest no move items and no grip', () => {
    renderBoard([habit('a', 0), habit('done', 1, { completed: true })]);
    expect(card('done').querySelector('.quest-card-grip')).toBeNull();
    expect(card('a').querySelector('.quest-card-grip')).not.toBeNull();
  });

  it('reorders the One-time and Backlog lanes under their own lane names', async () => {
    const user = userEvent.setup();
    const { reorderQuests } = renderBoard([oneTime('t1', 0), oneTime('t2', 1)], [idea('i1', 0), idea('i2', 1)]);
    await menuFor(user, '1-Time Quest', 'T2');
    await user.click(screen.getByRole('menuitem', { name: 'Move T2 up' }));
    expect(reorderQuests).toHaveBeenLastCalledWith('one_time', ['t2', 't1']);
    await menuFor(user, 'Backlog', 'I1');
    await user.click(screen.getByRole('menuitem', { name: 'Move I1 down' }));
    expect(reorderQuests).toHaveBeenLastCalledWith('backlog', ['i2', 'i1']);
  });

  it('shows no reorder controls while any quest in a lane lacks a position (a database before 044)', async () => {
    const user = userEvent.setup();
    renderBoard([habit('a', 0), habit('b')], [idea('i1'), idea('i2')]);
    expect(card('a').querySelector('.quest-card-grip')).toBeNull();
    await menuFor(user, 'Daily Quest', 'A');
    expect(screen.queryByRole('menuitem', { name: /Move A (up|down|to top)$/ })).toBeNull();
  });

  it('judges each lane on its own: an unordered Backlog does not switch off an ordered Daily lane', () => {
    renderBoard([habit('a', 0), habit('b', 1)], [idea('i1')]);
    expect(card('a').querySelector('.quest-card-grip')).not.toBeNull();
    expect(card('i1').querySelector('.quest-card-grip')).not.toBeNull();
  });

  it('keeps the Backlog and One-time menus moving between lanes alongside the reorder items', async () => {
    const user = userEvent.setup();
    renderBoard([], [idea('i1', 0), idea('i2', 1)]);
    await menuFor(user, 'Backlog', 'I1');
    expect(screen.getByRole('menuitem', { name: 'Move I1 to 1-Time' })).toBeEnabled();
  });

  describe('dragging a grip onto a card in the same lane', () => {
    it('drops before the target when the pointer is in its top half', () => {
      const { reorderQuests } = renderBoard([habit('a', 0), habit('b', 1)]);
      const grip = card('b').querySelector('.quest-card-grip') as HTMLElement;
      const dataTransfer = transfer({ id: 'b', from: 'habit' });
      fireEvent.dragStart(grip, { dataTransfer });
      dropOnCard('a', 105, dataTransfer);
      expect(reorderQuests).toHaveBeenCalledWith('habit', ['b', 'a']);
    });

    it('drops after the target when the pointer is in its bottom half', () => {
      const { reorderQuests } = renderBoard([habit('a', 0), habit('b', 1)]);
      const grip = card('a').querySelector('.quest-card-grip') as HTMLElement;
      const dataTransfer = transfer({ id: 'a', from: 'habit' });
      fireEvent.dragStart(grip, { dataTransfer });
      dropOnCard('b', 135, dataTransfer);
      expect(reorderQuests).toHaveBeenCalledWith('habit', ['b', 'a']);
    });

    it('does nothing when the card is dropped on itself, or on a finished quest', () => {
      const { reorderQuests } = renderBoard([habit('a', 0), habit('done', 1, { completed: true })]);
      const dataTransfer = transfer({ id: 'a', from: 'habit' });
      fireEvent.dragStart(card('a').querySelector('.quest-card-grip') as HTMLElement, { dataTransfer });
      dropOnCard('a', 105, dataTransfer);
      dropOnCard('done', 105, dataTransfer);
      expect(reorderQuests).not.toHaveBeenCalled();
    });

    it('does nothing for a drop of another lane\'s quest on a card', () => {
      const { reorderQuests } = renderBoard([habit('a', 0)], [idea('i1', 0)]);
      const dataTransfer = transfer({ id: 'i1', from: 'backlog' });
      fireEvent.dragStart(card('i1').querySelector('.quest-card-grip') as HTMLElement, { dataTransfer });
      dropOnCard('a', 105, dataTransfer);
      expect(reorderQuests).not.toHaveBeenCalled();
    });

    it('is not mistaken for a lane move: dropping Backlog on Backlog never moves it to 1-Time', () => {
      const { reorderQuests } = renderBoard([], [idea('i1', 0), idea('i2', 1)]);
      const dataTransfer = transfer({ id: 'i2', from: 'backlog' });
      fireEvent.dragStart(card('i2').querySelector('.quest-card-grip') as HTMLElement, { dataTransfer });
      fireEvent.drop(lane('Backlog'), { dataTransfer });
      expect(reorderQuests).not.toHaveBeenCalled();
    });

    it('does not light the lane as a drop target for a same-lane drag', () => {
      renderBoard([], [idea('i1', 0), idea('i2', 1)]);
      const dataTransfer = transfer({ id: 'i2', from: 'backlog' });
      fireEvent.dragStart(card('i2').querySelector('.quest-card-grip') as HTMLElement, { dataTransfer });
      fireEvent.dragOver(lane('Backlog'), { dataTransfer });
      expect(lane('Backlog')).not.toHaveClass('is-drop-target');
    });
  });
});
