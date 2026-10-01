// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type Quest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn(), saveHabit: vi.fn(), archiveQuest: vi.fn(), restoreQuest: vi.fn(), deleteQuest: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebQuestEditor from '../WebQuestEditor';

afterEach(cleanup);

const weekdayQuest: Quest = {
  id: 'weekday', name: 'Legacy habit', stat: 'STR', difficulty: 'Medium', easyVersion: 'One minute',
  description: null, questType: 'habit', archived: false, time: '08:00', days: [1, 3, 5], streak: 0,
  frozen: false, completed: false, targetCount: null, progressCount: 0,
};

function setup(quest?: Quest) {
  store.saveHabit.mockReset().mockResolvedValue(undefined);
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', quests: quest ? [quest] : [], longQuests: [] },
    saveHabit: store.saveHabit, archiveQuest: store.archiveQuest, restoreQuest: store.restoreQuest, deleteQuest: store.deleteQuest,
  });
}

describe('WebQuestEditor name validation and default days', () => {
  beforeEach(() => setup());

  it('rejects whitespace and zero-width-only names with field-specific copy', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'ONE-TIME' }));
    const name = screen.getByPlaceholderText('e.g. Morning run for 30 min');
    fireEvent.change(name, { target: { value: ' \u200b\u200c\u200d\u2060\ufeff ' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a quest name.');
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
  });

  it('accepts 80 code points and rejects 81 before saving', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'ONE-TIME' }));
    const name = screen.getByPlaceholderText('e.g. Morning run for 30 min');
    fireEvent.change(name, { target: { value: '😀'.repeat(81) } });
    expect(screen.getByRole('alert')).toHaveTextContent('80 characters or fewer.');
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
    fireEvent.change(name, { target: { value: '😀'.repeat(80) } });
    await user.click(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(store.saveHabit).toHaveBeenCalledOnce());
    expect(store.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ name: '😀'.repeat(80) }), undefined);
  });

  it('keeps an unchanged grandfathered name while saving another field', async () => {
    const legacy = { ...weekdayQuest, name: '🧭'.repeat(81) };
    setup(legacy);
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={legacy} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('Add a note, reminder, or motivation...'), 'New note');
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(store.saveHabit).toHaveBeenCalledOnce());
    expect(store.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ name: legacy.name, description: 'New note' }), 'weekday');
  });

  it('defaults new habits to every day and preserves an edited schedule', async () => {
    render(<WebQuestEditor onClose={vi.fn()} />);
    const dayButtons = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const day of dayButtons) expect(screen.getByRole('button', { name: day })).toHaveAttribute('aria-pressed', 'true');
    cleanup();
    setup(weekdayQuest);
    render(<WebQuestEditor editingQuest={weekdayQuest} onClose={vi.fn()} />);
    for (const day of ['Monday', 'Wednesday', 'Friday']) expect(screen.getByRole('button', { name: day })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveAttribute('aria-pressed', 'false');
  });
});
