// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type Quest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn(), restoreQuest: vi.fn(), deleteQuest: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import ArchivedHabits from '../ArchivedHabits';

afterEach(cleanup);

const archived = (id: string, name: string): Quest => ({
  id, name, stat: 'STR', difficulty: 'Medium', easyVersion: 'One minute', description: 'A note', questType: 'habit', archived: true,
  time: '08:00', days: [1], streak: 0, frozen: false, completed: false, targetCount: null, progressCount: 0,
});

describe('ArchivedHabits', () => {
  beforeEach(() => {
    store.restoreQuest.mockReset().mockResolvedValue(undefined);
    store.deleteQuest.mockReset().mockResolvedValue(undefined);
    store.useEiyu.mockReturnValue({
      user: { ...initialUser, quests: [archived('a1', 'Walk'), archived('a2', 'Read')], longQuests: [] },
      questsLoading: false, questsError: null, retryQuests: vi.fn(), restoreQuest: store.restoreQuest, deleteQuest: store.deleteQuest,
    });
  });

  it('lists archived quests as cards and opens a read-only details view with Restore and Delete', async () => {
    const user = userEvent.setup();
    render(<ArchivedHabits onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'View Walk details' }));
    const details = screen.getByRole('dialog', { name: 'Quest details' });
    expect(within(details).queryByRole('button', { name: 'Edit Quest' })).toBeNull();
    await user.click(within(details).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(store.restoreQuest).toHaveBeenCalledWith('a1'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Quest details' })).toBeNull());
  });

  it('confirms before deleting from the details view', async () => {
    const user = userEvent.setup();
    render(<ArchivedHabits onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'View Read details' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Quest details' })).getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('dialog', { name: 'Delete Read permanently?' })).toBeInTheDocument();
    expect(store.deleteQuest).not.toHaveBeenCalled();
  });

  it('shows the empty state when nothing is archived', () => {
    store.useEiyu.mockReturnValue({ user: { ...initialUser, quests: [], longQuests: [] }, questsLoading: false, questsError: null, retryQuests: vi.fn(), restoreQuest: store.restoreQuest, deleteQuest: store.deleteQuest });
    render(<ArchivedHabits onClose={vi.fn()} />);
    expect(screen.getByText(/No archived habits/)).toBeInTheDocument();
  });

  it('surfaces a failed restore from the details view instead of hiding it behind the dialog', async () => {
    store.restoreQuest.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<ArchivedHabits onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'View Walk details' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Quest details' })).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Quest details' })).toBeNull());
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/);
  });
});
