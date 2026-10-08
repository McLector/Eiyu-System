// @vitest-environment jsdom

import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import type { Quest } from '@eiyu/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QuestCard from '../QuestCard';
import { QUEST_DRAG_TYPE } from '../lane-drag';

afterEach(cleanup);

const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'q1', name: 'Walk', stat: 'STR', difficulty: 'Medium', easyVersion: 'One minute', description: 'Bring water',
  questType: 'habit', archived: false, time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0,
  frozen: false, dailyEligible: true, completed: false, targetCount: null, progressCount: 0, ...over,
});
const handlers = () => ({ onToggle: vi.fn(), onOpen: vi.fn(), onEdit: vi.fn(), onAdjustProgress: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn() });
const renderCard = (q: Quest, extra: Record<string, unknown> = {}) => {
  const h = handlers();
  render(<QuestCard quest={q} pending={false} {...h} {...extra} />);
  return h;
};
const card = () => screen.getByTestId('quest-card-q1');
const menuNames = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(within(card()).getByRole('button', { name: 'More actions for Walk' }));
  return within(screen.getByRole('menu')).getAllByRole('menuitem').map(item => item.getAttribute('aria-label'));
};

describe('QuestCard', () => {
  it('opens the details from the whole card: one real button, never nested with the controls', async () => {
    const user = userEvent.setup();
    const h = renderCard(quest());
    const open = within(card()).getByRole('button', { name: 'View Walk details' });
    expect(open.querySelector('button')).toBeNull();
    expect(open.contains(within(card()).getByRole('button', { name: 'Complete Walk' }))).toBe(false);
    await user.click(open);
    open.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(h.onOpen).toHaveBeenCalledTimes(3);
  });

  it('keeps the full name reachable when the title is truncated', () => {
    const name = 'Ünïcödé journey 🧭 '.repeat(5).slice(0, 80);
    renderCard(quest({ name }));
    expect(within(card()).getByRole('button', { name: `View ${name} details` })).toHaveAttribute('title', name);
  });

  it('completes and undoes with the same accessible names as before', async () => {
    const user = userEvent.setup();
    const h = renderCard(quest());
    await user.click(within(card()).getByRole('button', { name: 'Complete Walk' }));
    expect(h.onToggle).toHaveBeenCalledOnce();
    cleanup();
    renderCard(quest({ completed: true }));
    const undo = screen.getByRole('button', { name: 'Undo Walk' });
    expect(undo).toHaveAttribute('aria-pressed', 'true');
    expect(undo).toHaveClass('is-complete');
  });

  it('keeps the quantity stepper for a quantity habit', async () => {
    const user = userEvent.setup();
    const h = renderCard(quest({ targetCount: 3, progressCount: 1 }));
    await user.click(within(card()).getByRole('button', { name: 'Increase progress for Walk' }));
    expect(h.onAdjustProgress).toHaveBeenCalledWith(1);
    expect(within(card()).getByText('1/3')).toBeInTheDocument();
  });

  it('gives every control the shared compact class', () => {
    renderCard(quest({ targetCount: 3 }));
    for (const button of within(card()).getAllByRole('button')) {
      if (button.classList.contains('quest-card-open')) continue;
      expect(button.className, button.getAttribute('aria-label') ?? '').toMatch(/btn-compact/);
    }
  });

  it('shows Edit Quest, Archive and Delete for a habit, and no note shortcut', async () => {
    const user = userEvent.setup();
    renderCard(quest());
    expect(await menuNames(user)).toEqual(['Edit Walk', 'Archive Walk', 'Delete Walk']);
    expect(screen.getByRole('menuitem', { name: 'Edit Walk' })).toHaveTextContent('Edit Quest');
    expect(screen.getByRole('menuitem', { name: 'Delete Walk' })).toHaveClass('is-danger');
    expect(screen.queryByRole('button', { name: 'Edit note' })).toBeNull();
  });

  it('offers a move to Backlog for an unfinished One-time quest, not for a finished one', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    renderCard(quest({ questType: 'one_time', days: [] }), { onMove });
    expect(await menuNames(user)).toEqual(['Edit Walk', 'Move Walk to Backlog', 'Archive Walk', 'Delete Walk']);
    await user.click(screen.getByRole('menuitem', { name: 'Move Walk to Backlog' }));
    expect(onMove).toHaveBeenCalledOnce();
    cleanup();
    renderCard(quest({ questType: 'one_time', days: [], completed: true }), { onMove });
    expect(await menuNames(user)).toEqual(['Edit Walk', 'Archive Walk', 'Delete Walk']);
  });

  it('treats a Backlog quest as an idea: no Complete, no Archive, a move to 1-Time and a genre chip', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    renderCard(quest({ questType: 'backlog', days: [], genre: 'tool', timeSet: false, easyVersion: null }), { onMove });
    expect(within(card()).queryByRole('button', { name: /Complete Walk|Undo Walk/ })).toBeNull();
    expect(within(card()).getByText('Tool')).toBeInTheDocument();
    expect(await menuNames(user)).toEqual(['Edit Walk', 'Move Walk to 1-Time', 'Delete Walk']);
    await user.click(screen.getByRole('menuitem', { name: 'Move Walk to 1-Time' }));
    expect(onMove).toHaveBeenCalledOnce();
  });

  it('points the move arrow the way the quest travels: right into Backlog, left back to 1-Time', async () => {
    // The board lanes run One-time then Backlog from left to right.
    const user = userEvent.setup();
    const onMove = vi.fn();
    const arrow = (name: string) => screen.getByRole('menuitem', { name }).querySelector('svg') as SVGElement;
    renderCard(quest({ questType: 'one_time', days: [] }), { onMove });
    await menuNames(user);
    expect(arrow('Move Walk to Backlog').style.transform).toBe('');
    cleanup();
    renderCard(quest({ questType: 'backlog', days: [], genre: 'tool', timeSet: false, easyVersion: null }), { onMove });
    await menuNames(user);
    expect(arrow('Move Walk to 1-Time').style.transform).toBe('scaleX(-1)');
  });

  it('says No date for an undated One-time quest and Upcoming with the date for a later one', () => {
    renderCard(quest({ questType: 'one_time', days: [], timeSet: false, scheduledDate: null }), { today: '2026-10-05' });
    expect(within(card()).getByText('No date')).toBeInTheDocument();
    cleanup();
    renderCard(quest({ questType: 'one_time', days: [], timeSet: true, time: '09:30', scheduledDate: '2026-10-12' }), { today: '2026-10-05' });
    const when = within(card()).getByText('Upcoming Oct 12 09:30');
    expect(when).toHaveClass('is-upcoming');
  });

  it('keeps Today, without the upcoming style, for a quest dated today or when no date is passed', () => {
    renderCard(quest({ questType: 'one_time', days: [], timeSet: false, scheduledDate: '2026-10-05' }), { today: '2026-10-05' });
    expect(within(card()).getByText('Today')).not.toHaveClass('is-upcoming');
    cleanup();
    renderCard(quest({ questType: 'one_time', days: [], timeSet: false, scheduledDate: '2026-10-12' }));
    expect(within(card()).getByText('Today')).toBeInTheDocument();
  });

  it('can complete an upcoming or undated quest from the card', async () => {
    const user = userEvent.setup();
    const h = renderCard(quest({ questType: 'one_time', days: [], timeSet: false, scheduledDate: '2026-10-12' }), { today: '2026-10-05' });
    await user.click(within(card()).getByRole('button', { name: 'Complete Walk' }));
    expect(h.onToggle).toHaveBeenCalledOnce();
  });

  it('shows no genre chip on a habit', () => {
    renderCard(quest({ genre: 'tool' }));
    expect(within(card()).queryByText('Tool')).toBeNull();
  });

  it('is draggable by its handle only for Backlog and unfinished One-time quests', () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    renderCard(quest({ questType: 'backlog', days: [] }), { onDragStart, onDragEnd });
    const grip = card().querySelector('.quest-card-grip') as HTMLElement;
    const store = new Map<string, string>();
    const dataTransfer = { setData: (t: string, v: string) => store.set(t, v), effectAllowed: 'none', setDragImage: vi.fn() };
    fireEvent.dragStart(grip, { dataTransfer });
    expect(store.get(QUEST_DRAG_TYPE)).toBe(JSON.stringify({ id: 'q1', from: 'backlog' }));
    expect(onDragStart).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1' }));
    fireEvent.dragEnd(grip);
    expect(onDragEnd).toHaveBeenCalledOnce();
    cleanup();
    renderCard(quest({ questType: 'one_time', days: [], completed: true }), { onDragStart });
    expect(card().querySelector('.quest-card-grip')).toBeNull();
    cleanup();
    renderCard(quest(), { onDragStart });
    expect(card().querySelector('.quest-card-grip')).toBeNull();
  });
});

describe('QuestCard manual order', () => {
  const reorder = (over: Record<string, unknown> = {}) => ({
    state: { index: 1, count: 3, canMoveUp: true, canMoveDown: true },
    onMove: vi.fn(), onDrop: vi.fn(), dropReady: false, ...over,
  });
  const grip = () => card().querySelector('.quest-card-grip') as HTMLElement | null;
  const itemsOf = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(within(card()).getByRole('button', { name: 'More actions for Walk' }));
    return within(screen.getByRole('menu')).getAllByRole('menuitem');
  };

  it('offers Move to top, up and down after Edit, and runs them', async () => {
    const user = userEvent.setup();
    const r = reorder();
    renderCard(quest(), { reorder: r, onDragStart: vi.fn() });
    const items = await itemsOf(user);
    expect(items.map(item => item.getAttribute('aria-label'))).toEqual(['Edit Walk', 'Move Walk to top', 'Move Walk up', 'Move Walk down', 'Archive Walk', 'Delete Walk']);
    await user.click(screen.getByRole('menuitem', { name: 'Move Walk up' }));
    expect(r.onMove).toHaveBeenCalledWith('up');
  });

  it('disables the moves that go nowhere', async () => {
    const user = userEvent.setup();
    renderCard(quest(), { reorder: reorder({ state: { index: 0, count: 3, canMoveUp: false, canMoveDown: true } }), onDragStart: vi.fn() });
    const byName = Object.fromEntries((await itemsOf(user)).map(item => [item.getAttribute('aria-label'), item]));
    expect(byName['Move Walk to top']).toBeDisabled();
    expect(byName['Move Walk up']).toBeDisabled();
    expect(byName['Move Walk down']).toBeEnabled();
  });

  it('disables every move for a lone row', async () => {
    const user = userEvent.setup();
    renderCard(quest(), { reorder: reorder({ state: { index: 0, count: 1, canMoveUp: false, canMoveDown: false } }), onDragStart: vi.fn() });
    const moves = (await itemsOf(user)).filter(item => /^Move Walk (to top|up|down)$/.test(item.getAttribute('aria-label') ?? ''));
    expect(moves).toHaveLength(3);
    moves.forEach(item => expect(item).toBeDisabled());
  });

  it('shows no move items and no grip without a reorder prop (a database before 044)', async () => {
    const user = userEvent.setup();
    renderCard(quest(), { onDragStart: vi.fn() });
    expect(grip()).toBeNull();
    expect(await menuNames(user)).toEqual(['Edit Walk', 'Archive Walk', 'Delete Walk']);
  });

  it('gives a Daily habit a draggable grip that names its lane', () => {
    const onDragStart = vi.fn();
    renderCard(quest(), { reorder: reorder(), onDragStart });
    const store = new Map<string, string>();
    fireEvent.dragStart(grip()!, { dataTransfer: { setData: (t: string, v: string) => store.set(t, v), effectAllowed: 'none', setDragImage: vi.fn() } });
    expect(store.get(QUEST_DRAG_TYPE)).toBe(JSON.stringify({ id: 'q1', from: 'habit' }));
    expect(onDragStart).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1' }));
  });

  it('has no grip when no drag handler is given, since there would be nothing to start', () => {
    renderCard(quest(), { reorder: reorder() });
    expect(grip()).toBeNull();
  });

  const dropOn = (halfY: number, transfer: unknown) => {
    const event = createEvent.drop(card(), { dataTransfer: transfer });
    Object.defineProperty(event, 'clientY', { value: halfY });
    return { event, accepted: fireEvent(card(), event) };
  };
  const payload = (value: unknown) => ({ types: [QUEST_DRAG_TYPE], getData: (t: string) => (t === QUEST_DRAG_TYPE ? JSON.stringify(value) : ''), dropEffect: 'none' });

  it('takes a same-lane drop on its top half as before, and on its bottom half as after', () => {
    const r = reorder({ dropReady: true });
    renderCard(quest(), { reorder: r, onDragStart: vi.fn() });
    vi.spyOn(card(), 'getBoundingClientRect').mockReturnValue({ top: 100, height: 40, bottom: 140, left: 0, right: 100, width: 100, x: 0, y: 100, toJSON: () => ({}) });
    expect(dropOn(110, payload({ id: 'other', from: 'habit' })).event.defaultPrevented).toBe(true);
    expect(dropOn(130, payload({ id: 'other', from: 'habit' })).event.defaultPrevented).toBe(true);
    expect(r.onDrop.mock.calls).toEqual([['other', 'before'], ['other', 'after']]);
  });

  it('ignores a drop of itself, of another lane, or of junk', () => {
    const r = reorder({ dropReady: true });
    renderCard(quest(), { reorder: r, onDragStart: vi.fn() });
    dropOn(0, payload({ id: 'q1', from: 'habit' }));
    dropOn(0, payload({ id: 'x', from: 'backlog' }));
    dropOn(0, { types: [QUEST_DRAG_TYPE], getData: () => '{oops' });
    dropOn(0, { types: ['Files'], getData: () => '' });
    expect(r.onDrop).not.toHaveBeenCalled();
  });

  it('is not a drop target unless a same-lane drag is under way', () => {
    const r = reorder({ dropReady: false });
    renderCard(quest(), { reorder: r, onDragStart: vi.fn() });
    const over = createEvent.dragOver(card(), { dataTransfer: payload({ id: 'other', from: 'habit' }) });
    fireEvent(card(), over);
    expect(over.defaultPrevented).toBe(false);
    dropOn(0, payload({ id: 'other', from: 'habit' }));
    expect(r.onDrop).not.toHaveBeenCalled();
  });

  it('marks the half under the pointer while a drag hovers, and clears it on leave and drop', () => {
    renderCard(quest(), { reorder: reorder({ dropReady: true }), onDragStart: vi.fn() });
    vi.spyOn(card(), 'getBoundingClientRect').mockReturnValue({ top: 100, height: 40, bottom: 140, left: 0, right: 100, width: 100, x: 0, y: 100, toJSON: () => ({}) });
    const over = (y: number) => { const e = createEvent.dragOver(card(), { dataTransfer: payload({ id: 'other', from: 'habit' }) }); Object.defineProperty(e, 'clientY', { value: y }); fireEvent(card(), e); return e; };
    expect(over(105).defaultPrevented).toBe(true);
    expect(card()).toHaveClass('is-reorder-before');
    over(135);
    expect(card()).toHaveClass('is-reorder-after');
    expect(card()).not.toHaveClass('is-reorder-before');
    fireEvent.dragLeave(card(), { relatedTarget: document.body });
    expect(card()).not.toHaveClass('is-reorder-after');
    over(135);
    dropOn(135, payload({ id: 'other', from: 'habit' }));
    expect(card()).not.toHaveClass('is-reorder-after');
  });
});
