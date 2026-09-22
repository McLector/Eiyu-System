// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type Quest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  archiveQuest: vi.fn(),
  deleteQuest: vi.fn(),
  restoreQuest: vi.fn(),
  saveHabit: vi.fn(),
  useEiyu: vi.fn(),
}));

vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebQuestEditor from '../WebQuestEditor';

const habit: Quest = {
  id: 'habit-1',
  name: 'Morning walk',
  stat: 'STR',
  difficulty: 'Medium',
  easyVersion: 'Walk for one minute',
  description: null,
  questType: 'habit',
  archived: false,
  time: '08:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  streak: 2,
  frozen: false,
  completed: false,
  targetCount: null,
  progressCount: 0,
};

function setup(quest: Quest = habit) {
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', quests: [quest], longQuests: [] },
    saveHabit: store.saveHabit,
    archiveQuest: store.archiveQuest,
    deleteQuest: store.deleteQuest,
    restoreQuest: store.restoreQuest,
  });
  store.saveHabit.mockResolvedValue(undefined);
  store.archiveQuest.mockResolvedValue(undefined);
  store.deleteQuest.mockResolvedValue(undefined);
  store.restoreQuest.mockResolvedValue(undefined);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WebQuestEditor lifecycle controls', () => {
  beforeEach(() => setup());

  it('archives active quests through archive only', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={habit} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'ARCHIVE QUEST' }));

    expect(store.archiveQuest).toHaveBeenCalledOnce();
    expect(store.archiveQuest).toHaveBeenCalledWith('habit-1');
    expect(store.deleteQuest).not.toHaveBeenCalled();
  });

  it('suppresses a second lifecycle request while the first is pending', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    store.archiveQuest.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    render(<WebQuestEditor editingQuest={habit} onClose={vi.fn()} />);

    await Promise.all([
      user.click(screen.getByRole('button', { name: 'ARCHIVE QUEST' })),
      user.click(screen.getByRole('button', { name: 'ARCHIVE QUEST' })),
    ]);

    expect(store.archiveQuest).toHaveBeenCalledOnce();
    release();
  });

  it('requires explicit confirmation for permanent delete and Cancel performs no write', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={habit} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'DELETE PERMANENTLY' }));
    expect(screen.getByRole('dialog', { name: 'Delete quest permanently' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog', { name: 'Delete quest permanently' })).getByRole('button', { name: 'Cancel' }));
    expect(store.deleteQuest).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'DELETE PERMANENTLY' }));
    await user.click(screen.getByRole('button', { name: 'Confirm permanent delete' }));
    expect(store.deleteQuest).toHaveBeenCalledOnce();
    expect(store.deleteQuest).toHaveBeenCalledWith('habit-1');
    expect(store.archiveQuest).not.toHaveBeenCalled();
  });

  it('focuses the confirmation action and restores focus after Escape dismissal', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={habit} onClose={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'DELETE PERMANENTLY' });

    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'Confirm permanent delete' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Delete quest permanently' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('shows Restore and Delete for archived quests, with no completion action', async () => {
    const user = userEvent.setup();
    const archived = { ...habit, archived: true };
    setup(archived);
    render(<WebQuestEditor editingQuest={archived} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'RESTORE QUEST' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DELETE PERMANENTLY' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Complete|Undo/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'RESTORE QUEST' }));
    expect(store.restoreQuest).toHaveBeenCalledWith('habit-1');
    expect(store.archiveQuest).not.toHaveBeenCalled();
  });

  it('keeps the confirmation context after a failed delete so the user can retry', async () => {
    const user = userEvent.setup();
    store.deleteQuest.mockRejectedValueOnce(new Error('offline'));
    render(<WebQuestEditor editingQuest={habit} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'DELETE PERMANENTLY' }));
    await user.click(screen.getByRole('button', { name: 'Confirm permanent delete' }));

    expect(screen.getByRole('dialog', { name: 'Delete quest permanently' })).toBeInTheDocument();
    expect(screen.getByText('offline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm permanent delete' })).toBeEnabled();
  });
});
