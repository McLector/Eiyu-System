// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type Quest } from '@eiyu/shared';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn(), deleteQuest: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));
import WebBoard from '../WebBoard';

const archived: Quest = {
  id: 'one-archived', name: 'Saved one-time', stat: 'WIS', difficulty: 'Easy',
  easyVersion: null, description: null, questType: 'one_time', archived: true,
  time: '08:00', days: [], streak: 0, frozen: false, completed: false,
  targetCount: null, progressCount: 0, dailyEligible: false,
};

beforeEach(() => {
  store.deleteQuest.mockReset().mockResolvedValue(undefined);
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests: [archived], longQuests: [] },
    questsLoading: false, questsError: null, retryQuests: vi.fn(),
    toggleQuest: vi.fn(), adjustProgress: vi.fn(), completeRecovery: vi.fn(),
    archiveQuest: vi.fn(), restoreQuest: vi.fn(), deleteQuest: store.deleteQuest,
  });
});
afterEach(cleanup);

it('uses a contained Cancel-first confirmation from an archived card', async () => {
  const user = userEvent.setup();
  render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
  const trigger = screen.getByRole('button', { name: 'Delete Saved one-time' });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Delete Saved one-time permanently?' });
  expect(within(dialog).getByText(/History, Weekly Review, and earned XP remain/)).toBeInTheDocument();
  const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
  const confirm = within(dialog).getByRole('button', { name: 'Confirm permanent delete' });
  expect(cancel).toHaveFocus();
  expect((document.body.firstElementChild as HTMLElement).inert).toBe(true);
  await user.keyboard('{Shift>}{Tab}{/Shift}');
  expect(confirm).toHaveFocus();
  await user.keyboard('{Tab}');
  expect(cancel).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(store.deleteQuest).not.toHaveBeenCalled();
});

it('holds the dialog during a pending delete and sends one request', async () => {
  const user = userEvent.setup();
  let release!: () => void;
  store.deleteQuest.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
  await user.click(screen.getByRole('button', { name: 'Delete Saved one-time' }));
  await user.click(screen.getByRole('button', { name: 'Confirm permanent delete' }));
  await user.keyboard('{Escape}');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'DELETING…' })).toBeDisabled();
  await user.keyboard('{Tab}');
  expect(screen.getByRole('dialog')).toHaveFocus();
  expect(store.deleteQuest).toHaveBeenCalledTimes(1);
  await act(async () => { release(); });
});

it('keeps a failed delete visible and permits one deliberate retry', async () => {
  const user = userEvent.setup();
  store.deleteQuest.mockRejectedValueOnce(new Error('network offline')).mockResolvedValueOnce(undefined);
  render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
  await user.click(screen.getByRole('button', { name: 'Delete Saved one-time' }));
  await user.click(screen.getByRole('button', { name: 'Confirm permanent delete' }));

  const dialog = screen.getByRole('dialog', { name: 'Delete Saved one-time permanently?' });
  expect(within(dialog).getByRole('alert')).toHaveTextContent('network offline');
  expect(within(dialog).getByRole('button', { name: 'Confirm permanent delete' })).toBeEnabled();
  expect(store.deleteQuest).toHaveBeenCalledTimes(1);

  await user.click(within(dialog).getByRole('button', { name: 'Confirm permanent delete' }));
  expect(store.deleteQuest).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('shows earned XP only after the completion boundary succeeds', async () => {
  const active = { ...archived, id: 'active', name: 'Today quest', archived: false, dailyEligible: true };
  const toggleQuest = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests: [active], longQuests: [] },
    questsLoading: false, questsError: null, retryQuests: vi.fn(),
    toggleQuest, adjustProgress: vi.fn(), completeRecovery: vi.fn(),
    archiveQuest: vi.fn(), restoreQuest: vi.fn(), deleteQuest: store.deleteQuest,
  });
  const user = userEvent.setup();
  render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
  await user.click(screen.getByRole('button', { name: 'Complete Today quest' }));
  expect(screen.queryByText('+20 WIS XP')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Complete Today quest' }));
  await waitFor(() => expect(screen.getByText('+20 WIS XP')).toBeInTheDocument());
});

it('shows pending lifecycle state and sends one restore request from Archived', async () => {
  const user = userEvent.setup();
  let release!: () => void;
  const restoreQuest = vi.fn().mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests: [archived], longQuests: [] },
    questsLoading: false, questsError: null, retryQuests: vi.fn(),
    toggleQuest: vi.fn(), adjustProgress: vi.fn(), completeRecovery: vi.fn(),
    archiveQuest: vi.fn(), restoreQuest, deleteQuest: store.deleteQuest,
  });
  render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
  await user.click(screen.getByRole('button', { name: 'Restore Saved one-time' }));
  expect(screen.getByRole('button', { name: 'Restore Saved one-time' })).toBeDisabled();
  expect(screen.getByText('RESTORING…')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete Saved one-time' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Restore Saved one-time' }));
  expect(restoreQuest).toHaveBeenCalledTimes(1);
  await act(async () => { release(); });
  expect(screen.getByRole('button', { name: 'Restore Saved one-time' })).toBeEnabled();
});
