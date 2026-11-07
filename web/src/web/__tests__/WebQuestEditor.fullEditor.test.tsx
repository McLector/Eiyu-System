// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type Quest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The editor reads no permission state: the store mock deliberately has no `tracker`, `audience`, `acceptTracker` or `refreshTracker`.
const mocks = vi.hoisted(() => ({
  useEiyu: vi.fn(), saveHabit: vi.fn(), archiveQuest: vi.fn(), restoreQuest: vi.fn(), deleteQuest: vi.fn(),
}));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: mocks.useEiyu }));

import WebQuestEditor from '../WebQuestEditor';

afterEach(cleanup);

const base: Quest = {
  id: 'q1', name: 'Morning walk', stat: 'STR', difficulty: 'Medium', easyVersion: 'Walk a minute', description: 'note',
  questType: 'habit', archived: false, time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0, frozen: false, completed: false,
  targetCount: null, progressCount: 0,
};
// Quests saved before this change carry an inputKind (or none) that the editor must ignore.
const legacyUnclassified: Quest = { ...base };
const legacyBasic: Quest = { ...base, name: 'Quest 1', description: null, easyVersion: null, inputKind: 'basic', canWrite: true, targetCount: 3 };
const legacyNameless: Quest = { ...base, name: '', description: null, inputKind: 'basic', canWrite: true };
const legacyCustomReadOnly: Quest = { ...base, inputKind: 'custom', canWrite: false };

function setup(quests: Quest[] = []) {
  mocks.saveHabit.mockReset().mockResolvedValue(undefined);
  mocks.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', quests, longQuests: [] }, backlog: [],
    saveHabit: mocks.saveHabit, archiveQuest: mocks.archiveQuest, restoreQuest: mocks.restoreQuest, deleteQuest: mocks.deleteQuest,
  });
}
const nameField = () => screen.queryByPlaceholderText('e.g. Morning run for 30 min');

describe('new quest', () => {
  beforeEach(() => setup());

  it('shows the normal fields and none of the old tracking or permission wording', () => {
    render(<WebQuestEditor onClose={vi.fn()} />);
    expect(nameField()).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add a note, reminder, or motivation...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Walk for 10 min instead')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use basic tracking' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use custom details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Tracking style' })).not.toBeInTheDocument();
    expect(screen.queryByText(/neutral name/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/permission/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/paused for this account/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Read-only quest' })).not.toBeInTheDocument();
  });

  it('cannot be saved without a name', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('e.g. Walk for 10 min instead'), 'One stretch');
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(mocks.saveHabit).not.toHaveBeenCalled();
  });

  it('cannot be saved with a whitespace-only name', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    await user.type(nameField()!, '    ');
    await user.type(screen.getByPlaceholderText('e.g. Walk for 10 min instead'), 'One stretch');
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
  });

  it('rejects a 200-character name with the existing validation message and sends nothing', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    await user.click(nameField()!);
    await user.paste('x'.repeat(200));
    await user.type(screen.getByPlaceholderText('e.g. Walk for 10 min instead'), 'One stretch');
    expect(await screen.findByRole('alert')).toHaveTextContent(/\S/);
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
    expect(mocks.saveHabit).not.toHaveBeenCalled();
  });

  it('sends custom-mode values with the name and the penalty', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    await user.type(nameField()!, 'Stretch');
    await user.type(screen.getByPlaceholderText('e.g. Walk for 10 min instead'), 'One stretch');
    await user.click(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(mocks.saveHabit).toHaveBeenCalledOnce());
    const [editor, existingId] = mocks.saveHabit.mock.calls[0];
    expect(editor).toEqual({ mode: 'custom', values: expect.objectContaining({ name: 'Stretch', easyVersion: 'One stretch', questType: 'habit' }) });
    expect(existingId).toBeUndefined();
  });

  it('keeps the typed draft and focuses the error when the save is refused, without retrying', async () => {
    mocks.saveHabit.mockRejectedValue(new Error('This record changed, so nothing was saved.'));
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    await user.type(nameField()!, 'Stretch');
    await user.type(screen.getByPlaceholderText('e.g. Walk for 10 min instead'), 'One');
    await user.click(screen.getByRole('button', { name: 'CREATE QUEST' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/nothing was saved/);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(nameField()).toHaveValue('Stretch');
    expect(mocks.saveHabit).toHaveBeenCalledTimes(1);
  });
});

describe('quests saved under the old permission rules', () => {
  it('opens a quest that has no inputKind as a normal, editable quest', async () => {
    setup([legacyUnclassified]);
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={legacyUnclassified} onClose={vi.fn()} />);
    expect(screen.queryByRole('group', { name: 'Read-only quest' })).not.toBeInTheDocument();
    expect(nameField()).toBeEnabled();
    expect(nameField()).toHaveValue('Morning walk');
    await user.type(screen.getByPlaceholderText('Add a note, reminder, or motivation...'), '!');
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mocks.saveHabit).toHaveBeenCalledOnce());
    expect(mocks.saveHabit).toHaveBeenCalledWith({ mode: 'custom', values: expect.objectContaining({ name: 'Morning walk', description: 'note!' }) }, 'q1');
  });

  it('opens a custom quest the server marked unwritable as editable, with archive and delete available', () => {
    setup([legacyCustomReadOnly]);
    render(<WebQuestEditor editingQuest={legacyCustomReadOnly} onClose={vi.fn()} />);
    expect(screen.queryByRole('group', { name: 'Read-only quest' })).not.toBeInTheDocument();
    expect(nameField()).toBeEnabled();
    for (const name of ['SAVE CHANGES', 'ARCHIVE QUEST', 'DELETE PERMANENTLY']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
  });

  it('shows the full fields for a stored basic quest, with no basic chip and no neutral-name hint', async () => {
    setup([legacyBasic]);
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={legacyBasic} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Use basic tracking' })).not.toBeInTheDocument();
    expect(screen.queryByText(/neutral name/i)).not.toBeInTheDocument();
    expect(nameField()).toHaveValue('Quest 1');
    // Saving it sends the normal editor input and succeeds (a quantity habit needs no penalty).
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mocks.saveHabit).toHaveBeenCalledOnce());
    expect(mocks.saveHabit).toHaveBeenCalledWith({ mode: 'custom', values: expect.objectContaining({ name: 'Quest 1', targetCount: 3, easyVersion: null }) }, 'q1');
  });

  it('shows the name field for a legacy quest with no name and saves the new name', async () => {
    setup([legacyNameless]);
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={legacyNameless} onClose={vi.fn()} />);
    expect(nameField()).toBeInTheDocument();
    expect(nameField()).toHaveValue('');
    // A habit also needs its penalty; the empty stored name does not count as already accepted.
    await user.type(screen.getByPlaceholderText('e.g. Walk for 10 min instead'), 'One minute');
    expect(screen.getByRole('button', { name: 'SAVE CHANGES' })).toBeDisabled();
    await user.type(nameField()!, 'Evening stretch');
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mocks.saveHabit).toHaveBeenCalledOnce());
    expect(mocks.saveHabit).toHaveBeenCalledWith({ mode: 'custom', values: expect.objectContaining({ name: 'Evening stretch' }) }, 'q1');
  });

  it('asks for the penalty of a stored basic habit that has none, instead of saving it empty', async () => {
    const noPenalty: Quest = { ...legacyBasic, targetCount: null };
    setup([noPenalty]);
    render(<WebQuestEditor editingQuest={noPenalty} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('e.g. Walk for 10 min instead')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SAVE CHANGES' })).toBeDisabled();
  });

  it('still lets the person archive a stored basic quest', async () => {
    setup([legacyBasic]);
    mocks.archiveQuest.mockReset().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={legacyBasic} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'ARCHIVE QUEST' }));
    await waitFor(() => expect(mocks.archiveQuest).toHaveBeenCalledWith('q1'));
  });
});
