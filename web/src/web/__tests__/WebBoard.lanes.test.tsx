// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  id: 'h1', name: 'Walk', stat: 'STR', difficulty: 'Medium', easyVersion: 'One minute', description: 'Bring water',
  questType: 'habit', archived: false, time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0,
  frozen: false, dailyEligible: true, completed: false, targetCount: null, progressCount: 0,
};
const habit = (over: Partial<Quest> = {}): Quest => ({ ...base, ...over });
const oneTime = (over: Partial<Quest> = {}): Quest => ({ ...base, id: 't1', name: 'Pay rent', questType: 'one_time', days: [], easyVersion: null, genre: 'todo', timeSet: false, ...over });
const idea = (over: Partial<Quest> = {}): Quest => ({ ...base, id: 'b1', name: 'Try Obsidian', questType: 'backlog', days: [], easyVersion: null, genre: 'tool', timeSet: false, dailyEligible: false, ...over });

const actions = () => ({ moveToOneTime: vi.fn().mockResolvedValue(undefined), moveToBacklog: vi.fn().mockResolvedValue(undefined) });
function renderBoard(quests: Quest[], backlog: Quest[], extra: Record<string, unknown> = {}) {
  const move = actions();
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests, longQuests: [] }, backlog,
    questsLoading: false, questsError: null, retryQuests: vi.fn(), toggleQuest: vi.fn(), adjustProgress: vi.fn(),
    completeRecovery: vi.fn(), archiveQuest: vi.fn(), restoreQuest: vi.fn(), deleteQuest: vi.fn(), ...move, ...extra,
  });
  const onNewQuest = vi.fn();
  const onEditQuest = vi.fn();
  render(<WebBoard onNewQuest={onNewQuest} onEditQuest={onEditQuest} darkMode />);
  return { ...move, onNewQuest, onEditQuest };
}
const lane = (name: string) => screen.getByRole('region', { name });
const transfer = (payload?: unknown, types?: string[]) => {
  const bag = new Map<string, string>();
  if (payload !== undefined) bag.set(QUEST_DRAG_TYPE, typeof payload === 'string' ? payload : JSON.stringify(payload));
  return { types: types ?? [...bag.keys()], getData: (t: string) => bag.get(t) ?? '', setData: (t: string, v: string) => { bag.set(t, v); }, effectAllowed: 'none', dropEffect: 'none', setDragImage: vi.fn() };
};

describe('board lanes', () => {
  beforeEach(() => store.useEiyu.mockReset());

  it('shows Daily, One Time and Backlog lanes and no All Habits lane', () => {
    renderBoard([habit(), oneTime()], [idea()]);
    expect(lane('Daily Quest')).toBeInTheDocument();
    expect(lane('One Time Quest')).toBeInTheDocument();
    expect(lane('Backlog')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'All Habits' })).toBeNull();
    expect(within(lane('Backlog')).getByText('Try Obsidian')).toBeInTheDocument();
    expect(within(lane('Backlog')).getByText('Tool')).toBeInTheDocument();
  });

  it('replaces the All Habits tab with Backlog and counts it', () => {
    renderBoard([habit()], [idea(), idea({ id: 'b2', name: 'Another' })]);
    const tabs = within(screen.getByRole('tablist', { name: 'Board lanes' }));
    expect(tabs.getByRole('tab', { name: /Backlog/ })).toHaveTextContent('2');
    expect(tabs.queryByRole('tab', { name: /All Habits/ })).toBeNull();
  });

  it('shows a friendly empty Backlog lane', () => {
    renderBoard([habit()], []);
    expect(within(lane('Backlog')).getByText(/Nothing parked yet/)).toBeInTheDocument();
  });

  it('adds quests to the right lane', async () => {
    const user = userEvent.setup();
    const { onNewQuest } = renderBoard([habit()], []);
    await user.click(within(lane('Backlog')).getByRole('button', { name: /ADD QUEST/ }));
    await user.click(within(lane('One Time Quest')).getByRole('button', { name: /ADD QUEST/ }));
    await user.click(within(lane('Daily Quest')).getByRole('button', { name: /ADD QUEST/ }));
    expect(onNewQuest.mock.calls.map(call => call[0])).toEqual(['backlog', 'one_time', 'habit']);
  });

  it('opens All Habits as a dialog from the Daily lane, with Edit Quest, Archive and Delete per habit', async () => {
    const user = userEvent.setup();
    const { onEditQuest } = renderBoard([habit({ dailyEligible: false })], []);
    await user.click(within(lane('Daily Quest')).getByRole('button', { name: /ALL HABITS/ }));
    const dialog = screen.getByRole('dialog', { name: 'All habits' });
    await user.click(within(dialog).getByRole('button', { name: 'More actions for Walk' }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map(i => i.getAttribute('aria-label'))).toEqual(['Edit Walk', 'Archive Walk', 'Delete Walk']);
    await user.click(screen.getByRole('menuitem', { name: 'Edit Walk' }));
    expect(onEditQuest).toHaveBeenCalledWith('h1');
  });

  it('keeps Backlog quests out of today\'s progress', () => {
    renderBoard([habit({ completed: true })], [idea()]);
    expect(screen.getByText('1', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/\/ 1 quests/)).toBeInTheDocument();
  });
});

describe('One Time lane with undated and upcoming quests', () => {
  beforeEach(() => store.useEiyu.mockReset());
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  // The lane pages its cards (one or two per page under jsdom), so order is checked on the first card.
  const firstCard = () => within(lane('One Time Quest')).getAllByTestId(/^quest-card-/)[0].getAttribute('data-testid');

  it('puts an undated quest before an upcoming one, and today before an undated one', () => {
    renderBoard([oneTime({ id: 'far', scheduledDate: day(9) }), oneTime({ id: 'und', scheduledDate: null })], []);
    expect(firstCard()).toBe('quest-card-und');
    cleanup();
    store.useEiyu.mockReset();
    renderBoard([oneTime({ id: 'und', scheduledDate: null }), oneTime({ id: 'now', scheduledDate: day(0) })], []);
    expect(firstCard()).toBe('quest-card-now');
  });

  it('labels an undated quest No date and an upcoming one Upcoming', () => {
    renderBoard([oneTime({ id: 'und', scheduledDate: null })], []);
    expect(within(lane('One Time Quest')).getByText('No date')).toBeInTheDocument();
    cleanup();
    store.useEiyu.mockReset();
    renderBoard([oneTime({ id: 'far', scheduledDate: day(9) })], []);
    expect(within(lane('One Time Quest')).getByText(/^Upcoming /)).toBeInTheDocument();
  });

  it('does not count an open upcoming quest toward today, and counts it once done', () => {
    renderBoard([oneTime({ id: 'a', scheduledDate: day(0) }), oneTime({ id: 'b', scheduledDate: day(5) })], []);
    expect(screen.getByText(/\/ 1 quests/)).toBeInTheDocument();
    cleanup();
    store.useEiyu.mockReset();
    renderBoard([oneTime({ id: 'a', scheduledDate: day(0) }), oneTime({ id: 'b', scheduledDate: day(5), completed: true })], []);
    expect(screen.getByText(/\/ 2 quests/)).toBeInTheDocument();
  });
});

describe('moving quests between lanes', () => {
  beforeEach(() => store.useEiyu.mockReset());

  it('moves a Backlog quest to One-time from its menu', async () => {
    const user = userEvent.setup();
    const { moveToOneTime } = renderBoard([], [idea()]);
    await user.click(within(lane('Backlog')).getByRole('button', { name: 'More actions for Try Obsidian' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move Try Obsidian to One-time' }));
    expect(moveToOneTime).toHaveBeenCalledWith('b1');
  });

  it('moves a One-time quest back to Backlog from its menu', async () => {
    const user = userEvent.setup();
    const { moveToBacklog } = renderBoard([oneTime()], []);
    await user.click(within(lane('One Time Quest')).getByRole('button', { name: 'More actions for Pay rent' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move Pay rent to Backlog' }));
    expect(moveToBacklog).toHaveBeenCalledWith('t1');
  });

  it('moves a Backlog quest when it is dropped on One Time Quest, and only once for a double drop', async () => {
    let release!: () => void;
    const moveToOneTime = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    renderBoard([], [idea()], { moveToOneTime });
    const grip = screen.getByTestId('quest-card-b1').querySelector('.quest-card-grip') as HTMLElement;
    fireEvent.dragStart(grip, { dataTransfer: transfer() });
    expect(within(lane('One Time Quest')).getByText(/Drop to schedule for today/)).toBeInTheDocument();
    const payload = transfer({ id: 'b1', from: 'backlog' });
    fireEvent.dragOver(lane('One Time Quest'), { dataTransfer: payload });
    fireEvent.drop(lane('One Time Quest'), { dataTransfer: payload });
    fireEvent.drop(lane('One Time Quest'), { dataTransfer: payload });
    expect(moveToOneTime).toHaveBeenCalledTimes(1);
    expect(moveToOneTime).toHaveBeenCalledWith('b1');
    release();
  });

  it('moves a One-time quest dropped on Backlog, and ignores a drop on the lane it came from', async () => {
    const { moveToBacklog, moveToOneTime } = renderBoard([oneTime()], [idea()]);
    fireEvent.drop(lane('Backlog'), { dataTransfer: transfer({ id: 't1', from: 'one_time' }) });
    expect(moveToBacklog).toHaveBeenCalledWith('t1');
    fireEvent.drop(lane('One Time Quest'), { dataTransfer: transfer({ id: 't1', from: 'one_time' }) });
    fireEvent.drop(lane('Backlog'), { dataTransfer: transfer({ id: 'b1', from: 'backlog' }) });
    expect(moveToOneTime).not.toHaveBeenCalled();
    expect(moveToBacklog).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a dragged file', transfer(undefined, ['Files'])],
    ['dragged text', transfer(undefined, ['text/plain'])],
    ['malformed json', transfer('{oops')],
    ['a habit payload', transfer({ id: 'h1', from: 'habit' })],
    ['an unknown id', transfer({ id: 'nope', from: 'backlog' })],
  ])('ignores %s dropped on a lane', (_label, dataTransfer) => {
    const { moveToOneTime, moveToBacklog } = renderBoard([habit(), oneTime()], [idea()]);
    const accepted = fireEvent.dragOver(lane('One Time Quest'), { dataTransfer });
    if (dataTransfer.types.length === 0 || !dataTransfer.types.includes(QUEST_DRAG_TYPE)) expect(accepted).toBe(true);
    fireEvent.drop(lane('One Time Quest'), { dataTransfer });
    fireEvent.drop(lane('Backlog'), { dataTransfer });
    expect(moveToOneTime).not.toHaveBeenCalled();
    expect(moveToBacklog).not.toHaveBeenCalled();
  });

  it('ignores a stale drop of a finished One-time quest on Backlog', () => {
    const { moveToBacklog } = renderBoard([oneTime({ completed: true })], []);
    fireEvent.drop(lane('Backlog'), { dataTransfer: transfer({ id: 't1', from: 'one_time' }) });
    expect(moveToBacklog).not.toHaveBeenCalled();
  });

  it('calls the server once when a card is dropped while its menu move is in flight', async () => {
    const user = userEvent.setup();
    const moveToOneTime = vi.fn(() => new Promise<void>(() => {}));
    renderBoard([], [idea()], { moveToOneTime });
    await user.click(within(lane('Backlog')).getByRole('button', { name: 'More actions for Try Obsidian' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move Try Obsidian to One-time' }));
    fireEvent.drop(lane('One Time Quest'), { dataTransfer: transfer({ id: 'b1', from: 'backlog' }) });
    expect(moveToOneTime).toHaveBeenCalledTimes(1);
  });

  it('does not offer a drag handle on a finished One-time quest', () => {
    renderBoard([oneTime({ completed: true })], []);
    expect(screen.getByTestId('quest-card-t1').querySelector('.quest-card-grip')).toBeNull();
  });

  it('clears the pending state when a move fails, so the card can be tried again', async () => {
    const user = userEvent.setup();
    const moveToOneTime = vi.fn().mockRejectedValue(new Error('boom'));
    renderBoard([], [idea()], { moveToOneTime });
    const trigger = () => within(lane('Backlog')).getByRole('button', { name: 'More actions for Try Obsidian' });
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'Move Try Obsidian to One-time' }));
    expect(moveToOneTime).toHaveBeenCalledOnce();
    await waitFor(() => expect(trigger()).not.toBeDisabled());
  });

  it('shows the board error state with Retry when a move has failed', async () => {
    const user = userEvent.setup();
    const retryQuests = vi.fn().mockResolvedValue(undefined);
    renderBoard([], [idea()], { questsError: 'quest has a completion', retryQuests });
    expect(screen.queryByRole('region', { name: 'Backlog' })).toBeNull();
    expect(screen.getByText('quest has a completion')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'RETRY' }));
    expect(retryQuests).toHaveBeenCalledOnce();
  });
});

describe('backlog read states', () => {
  beforeEach(() => store.useEiyu.mockReset());

  it('does not claim the Backlog is empty while it is still loading', () => {
    renderBoard([habit()], [], { backlogLoading: true });
    expect(within(lane('Backlog')).queryByText(/Nothing parked yet/)).toBeNull();
    expect(within(lane('Backlog')).getByText(/Reading Backlog/)).toBeInTheDocument();
  });
});
