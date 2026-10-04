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
    render(<WebQuestEditor initialType="one_time" onClose={vi.fn()} />);
    const name = screen.getByPlaceholderText('e.g. Morning run for 30 min');
    fireEvent.change(name, { target: { value: ' \u200b\u200c\u200d\u2060\ufeff ' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a quest name.');
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
  });

  it('does not accuse an untouched form, but flags a name cleared after typing', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Quest name' })).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
    const name = screen.getByRole('textbox', { name: 'Quest name' });
    await user.type(name, 'Run');
    await user.clear(name);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a quest name.');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    // Beside the label, not under the field: an error must not add a line to a dialog that may not scroll.
    expect(screen.getByRole('alert').closest('.field-label-row')).toHaveTextContent('QUEST NAME');
  });

  it('accepts 80 code points and rejects 81 before saving', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor initialType="one_time" onClose={vi.fn()} />);
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

it('creates only the requested one-time type and saved types take precedence', async () => {
  setup();
  const user = userEvent.setup();
  render(<WebQuestEditor initialType="one_time" onClose={vi.fn()} />);
  expect(screen.getByText('NEW ONE TIME QUEST')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Monday' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'ONE-TIME' })).not.toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: 'Quest name' }), 'Appointment');
  await user.click(screen.getByRole('button', { name: 'CREATE QUEST' }));
  await waitFor(() => expect(store.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ questType: 'one_time', targetCount: null }), undefined));
  cleanup();
  setup(weekdayQuest);
  render(<WebQuestEditor initialType="one_time" editingQuest={weekdayQuest} onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Monday' })).toBeInTheDocument();
});
