// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type Quest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebBoard from '../WebBoard';

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
    const controls = within(card()).getByRole('button', { name: 'Complete Walk' }).closest('.quest-card-controls')!;
    expect(within(controls as HTMLElement).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Complete Walk', 'More actions for Walk']);
    expect(within(card()).queryByRole('button', { name: 'Delete Walk' })).toBeNull();
    expect(within(card()).queryByRole('menuitem')).toBeNull();
  });

  it('keeps Edit Quest, Archive and Delete inside the menu', async () => {
    const user = userEvent.setup();
    renderBoard([quest()]);
    const menu = await openMenu(user);
    expect(within(menu).getAllByRole('menuitem').map(i => i.getAttribute('aria-label'))).toEqual(['Edit Walk', 'Archive Walk', 'Delete Walk']);
    expect(within(menu).getByRole('menuitem', { name: 'Delete Walk' })).toHaveClass('is-danger');
  });

  it('has no Edit note shortcut: the note lives in the Details dialog', () => {
    renderBoard([quest()]);
    expect(within(card()).queryByRole('button', { name: 'Edit note' })).toBeNull();
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

  it('opens the read-only details from the card, and Edit Quest from the menu opens the editor', async () => {
    const user = userEvent.setup();
    const onEditQuest = vi.fn();
    store.useEiyu.mockReturnValue({
      user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests: [quest()], longQuests: [] },
      questsLoading: false, questsError: null, retryQuests: vi.fn(), toggleQuest: vi.fn(), adjustProgress: vi.fn(),
      completeRecovery: vi.fn(), archiveQuest: vi.fn(), deleteQuest: vi.fn(),
    });
    render(<WebBoard onNewQuest={vi.fn()} onEditQuest={onEditQuest} darkMode />);
    await user.click(within(card()).getByRole('button', { name: 'View Walk details' }));
    const dialog = screen.getByRole('dialog', { name: 'Quest details' });
    expect(dialog).toHaveTextContent('Bring water');
    expect(onEditQuest).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Edit Quest' }));
    expect(onEditQuest).toHaveBeenCalledWith('q1');
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Edit Walk' }));
    expect(onEditQuest).toHaveBeenCalledTimes(2);
  });
});
