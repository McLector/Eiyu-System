// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

  it('treats a Backlog quest as an idea: no Complete, no Archive, a move to One-time and a genre chip', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    renderCard(quest({ questType: 'backlog', days: [], genre: 'tool', timeSet: false, easyVersion: null }), { onMove });
    expect(within(card()).queryByRole('button', { name: /Complete Walk|Undo Walk/ })).toBeNull();
    expect(within(card()).getByText('Tool')).toBeInTheDocument();
    expect(await menuNames(user)).toEqual(['Edit Walk', 'Move Walk to One-time', 'Delete Walk']);
    await user.click(screen.getByRole('menuitem', { name: 'Move Walk to One-time' }));
    expect(onMove).toHaveBeenCalledOnce();
  });

  it('points the move arrow the way the quest travels: right into Backlog, left back to One-time', async () => {
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
    expect(arrow('Move Walk to One-time').style.transform).toBe('scaleX(-1)');
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
