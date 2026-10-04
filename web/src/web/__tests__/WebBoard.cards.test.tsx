// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { initialUser, type Quest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebBoard, { ArchivedCard } from '../WebBoard';

afterEach(cleanup);

const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'q1', name: 'Walk', stat: 'STR', difficulty: 'Medium', easyVersion: 'One minute', description: 'Bring water',
  questType: 'habit', archived: false, time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0,
  frozen: false, dailyEligible: true, completed: false, targetCount: null, progressCount: 0, ...over,
});

function renderBoard(quests: Quest[]) {
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests, longQuests: [] },
    questsLoading: false, questsError: null, retryQuests: vi.fn(), toggleQuest: vi.fn(),
    adjustProgress: vi.fn(), completeRecovery: vi.fn(), archiveQuest: vi.fn(), deleteQuest: vi.fn(),
  });
  return render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
}

describe('Board card actions', () => {
  beforeEach(() => store.useEiyu.mockReset());

  it('keeps the primary and secondary actions of a daily card on one row', () => {
    renderBoard([quest()]);
    const card = screen.getByTestId('quest-card-q1');
    const row = within(card).getByRole('button', { name: 'Complete Walk' }).closest('.board-card-actions');
    expect(row).not.toBeNull();
    for (const name of ['Open Walk details', 'Archive Walk', 'Delete Walk']) {
      expect(within(card).getByRole('button', { name }).closest('.board-card-actions')).toBe(row);
    }
    expect(card.querySelector('.board-card-lifecycle')).toBeNull();
  });

  it('labels the note shortcut for what it does: it opens the editor, so it says Edit note', () => {
    renderBoard([quest()]);
    const card = screen.getByTestId('quest-card-q1');
    expect(within(card).getByRole('button', { name: 'Edit note' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Show note' })).toBeNull();
  });

  it('puts the primary action first and the secondary group after it, in reading order', () => {
    renderBoard([quest()]);
    const row = within(screen.getByTestId('quest-card-q1')).getByRole('button', { name: 'Complete Walk' }).closest('.board-card-actions')!;
    const names = within(row as HTMLElement).getAllByRole('button').map(b => b.getAttribute('aria-label'));
    expect(names).toEqual(['Complete Walk', 'Open Walk details', 'Archive Walk', 'Delete Walk']);
  });

  it('gives every card button the shared compact control class, with destructive and quiet roles', () => {
    renderBoard([quest({ targetCount: 3 })]);
    const card = screen.getByTestId('quest-card-q1');
    for (const button of within(card).getAllByRole('button')) {
      if (button.classList.contains('board-card-title')) continue;
      expect(button.className, button.getAttribute('aria-label') ?? button.textContent ?? '').toMatch(/btn-compact/);
    }
    expect(within(card).getByRole('button', { name: 'Delete Walk' })).toHaveClass('btn-destructive');
    expect(within(card).getByRole('button', { name: 'Archive Walk' })).toHaveClass('btn-quiet');
  });

  it('marks a completed card as pressed with the success treatment and keeps the Undo label', () => {
    renderBoard([quest({ completed: true })]);
    const undo = screen.getByRole('button', { name: 'Undo Walk' });
    expect(undo).toHaveAttribute('aria-pressed', 'true');
    expect(undo).toHaveClass('is-complete');
  });

  it('shows the pending label and disables lifecycle buttons while a lifecycle call is in flight', async () => {
    const archive = vi.fn(() => new Promise<void>(() => undefined));
    store.useEiyu.mockReturnValue({
      user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests: [quest()], longQuests: [] },
      questsLoading: false, questsError: null, retryQuests: vi.fn(), toggleQuest: vi.fn(),
      adjustProgress: vi.fn(), completeRecovery: vi.fn(), archiveQuest: archive, deleteQuest: vi.fn(),
    });
    render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
    const card = screen.getByTestId('quest-card-q1');
    within(card).getByRole('button', { name: 'Archive Walk' }).click();
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Archive Walk' })).toHaveTextContent('ARCHIVING…'));
    expect(within(card).getByRole('button', { name: 'Delete Walk' })).toBeDisabled();
  });
});

describe('Catalog and archived card actions', () => {
  it('uses the same compact quiet/destructive idiom in the All Habits catalog', () => {
    renderBoard([quest({ dailyEligible: false })]);
    const catalog = document.querySelector('.board-catalog-card') as HTMLElement;
    expect(within(catalog).getByRole('button', { name: 'Archive Walk' })).toHaveClass('btn-quiet', 'btn-compact');
    expect(within(catalog).getByRole('button', { name: 'Delete Walk' })).toHaveClass('btn-destructive', 'btn-compact');
  });

  it('uses it for the archived card inside the Archived habits dialog too', () => {
    render(<ArchivedCard quest={quest({ archived: true })} pending={false} onEdit={vi.fn()} onRestore={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Restore Walk' })).toHaveClass('btn-quiet', 'btn-compact');
    expect(screen.getByRole('button', { name: 'Delete Walk' })).toHaveClass('btn-destructive', 'btn-compact');
  });
});
