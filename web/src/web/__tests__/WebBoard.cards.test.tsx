// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
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

function renderBoard(quests: Quest[], extra: Record<string, unknown> = {}) {
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests, longQuests: [] },
    questsLoading: false, questsError: null, retryQuests: vi.fn(), toggleQuest: vi.fn(),
    adjustProgress: vi.fn(), completeRecovery: vi.fn(), archiveQuest: vi.fn(), deleteQuest: vi.fn(), ...extra,
  });
  return render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
}
const card = () => screen.getByTestId('quest-card-q1');
const openMenu = async (user: ReturnType<typeof userEvent.setup>, scope: HTMLElement = card()) => {
  await user.click(within(scope).getByRole('button', { name: 'More actions for Walk' }));
  return screen.getByRole('menu', { name: 'More actions for Walk' });
};

describe('Board card actions', () => {
  beforeEach(() => store.useEiyu.mockReset());

  it('shows one prominent action and one menu button on a daily card, nothing else competing', () => {
    renderBoard([quest()]);
    const row = within(card()).getByRole('button', { name: 'Complete Walk' }).closest('.board-card-actions')!;
    expect(within(row as HTMLElement).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Complete Walk', 'More actions for Walk']);
    expect(within(card()).queryByRole('button', { name: 'Delete Walk' })).toBeNull();
    expect(within(card()).queryByRole('menuitem')).toBeNull();
  });

  it('keeps Details, Archive and Delete inside the menu, with the same accessible names as before', async () => {
    const user = userEvent.setup();
    renderBoard([quest()]);
    const menu = await openMenu(user);
    expect(within(menu).getAllByRole('menuitem').map(i => i.getAttribute('aria-label'))).toEqual(['Open Walk details', 'Archive Walk', 'Delete Walk']);
    expect(within(menu).getByRole('menuitem', { name: 'Delete Walk' })).toHaveClass('is-danger');
  });

  it('gives the card buttons the shared compact control class', () => {
    renderBoard([quest({ targetCount: 3 })]);
    for (const button of within(card()).getAllByRole('button')) {
      if (button.classList.contains('board-card-title')) continue;
      expect(button.className, button.getAttribute('aria-label') ?? button.textContent ?? '').toMatch(/btn-compact/);
    }
  });

  it('labels the note shortcut for what it does: it opens the editor, so it says Edit note', () => {
    renderBoard([quest()]);
    expect(within(card()).getByRole('button', { name: 'Edit note' })).toBeInTheDocument();
    expect(within(card()).queryByRole('button', { name: 'Show note' })).toBeNull();
  });

  it('marks a completed card as pressed with the success treatment and keeps the Undo label', () => {
    renderBoard([quest({ completed: true })]);
    const undo = screen.getByRole('button', { name: 'Undo Walk' });
    expect(undo).toHaveAttribute('aria-pressed', 'true');
    expect(undo).toHaveClass('is-complete');
  });

  it('archives from the menu, and the trigger is busy and disabled while the call is in flight', async () => {
    const user = userEvent.setup();
    const archive = vi.fn(() => new Promise<void>(() => undefined));
    renderBoard([quest()], { archiveQuest: archive });
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Archive Walk' }));
    expect(archive).toHaveBeenCalledWith('q1');
    await waitFor(() => expect(within(card()).getByRole('button', { name: 'More actions for Walk' })).toBeDisabled());
    expect(within(card()).getByRole('button', { name: 'More actions for Walk' })).toHaveAttribute('aria-busy', 'true');
  });

  it('opens the details from the menu', async () => {
    const user = userEvent.setup();
    const onEditQuest = vi.fn();
    store.useEiyu.mockReturnValue({
      user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests: [quest()], longQuests: [] },
      questsLoading: false, questsError: null, retryQuests: vi.fn(), toggleQuest: vi.fn(), adjustProgress: vi.fn(),
      completeRecovery: vi.fn(), archiveQuest: vi.fn(), deleteQuest: vi.fn(),
    });
    render(<WebBoard onNewQuest={vi.fn()} onEditQuest={onEditQuest} darkMode />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Open Walk details' }));
    expect(onEditQuest).toHaveBeenCalledOnce();
  });
});

describe('Catalog and archived card actions', () => {
  it('uses the same menu in the All Habits catalog, with Archive and Delete', async () => {
    const user = userEvent.setup();
    renderBoard([quest({ dailyEligible: false })]);
    const catalog = document.querySelector('.board-catalog-card') as HTMLElement;
    const menu = await openMenu(user, catalog);
    expect(within(menu).getAllByRole('menuitem').map(i => i.getAttribute('aria-label'))).toEqual(['Archive Walk', 'Delete Walk']);
  });

  it('keeps Restore and Delete visible on the archived card, since that is only two actions', () => {
    render(<ArchivedCard quest={quest({ archived: true })} pending={false} onEdit={vi.fn()} onRestore={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Restore Walk' })).toHaveClass('btn-quiet', 'btn-compact');
    expect(screen.getByRole('button', { name: 'Delete Walk' })).toHaveClass('btn-destructive', 'btn-compact');
  });
});
