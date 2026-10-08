// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type Quest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn(), saveHabit: vi.fn(), archiveQuest: vi.fn(), restoreQuest: vi.fn(), deleteQuest: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebQuestEditor from '../WebQuestEditor';

afterEach(cleanup);

const backlogQuest: Quest = {
  id: 'b1', name: 'Try Obsidian', stat: 'INT', difficulty: 'Easy', easyVersion: null, description: 'later', questType: 'backlog',
  genre: 'tool', timeSet: false, archived: false, time: '08:00', days: [], streak: 0, frozen: false, completed: false,
  targetCount: null, progressCount: 0,
};
const oneTimeQuest: Quest = { ...backlogQuest, id: 'o1', name: 'Read RFC', questType: 'one_time', genre: 'article', timeSet: true, time: '09:30' };

function setup(quest?: Quest) {
  store.saveHabit.mockReset().mockResolvedValue(undefined);
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', quests: quest ? [quest] : [], longQuests: [] },
    saveHabit: store.saveHabit, archiveQuest: store.archiveQuest, restoreQuest: store.restoreQuest, deleteQuest: store.deleteQuest,
  });
}
const nameField = () => screen.getByPlaceholderText('e.g. Morning run for 30 min');

describe('quest editor types', () => {
  beforeEach(() => setup());

  it('keeps a Backlog quest a Backlog quest when it is edited and saved', async () => {
    setup(backlogQuest);
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={backlogQuest} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('Add a note, reminder, or motivation...'), ' more');
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(store.saveHabit).toHaveBeenCalledOnce());
    expect(store.saveHabit).toHaveBeenCalledWith(
      expect.objectContaining({ questType: 'backlog', days: [], scheduledDate: null, easyVersion: null, genre: 'tool', timeSet: false, description: 'later more' }),
      'b1',
    );
  });

  it('keeps a One-time quest One-time and remembers its time was set', async () => {
    setup(oneTimeQuest);
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={oneTimeQuest} onClose={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'No set time' })).not.toBeChecked();
    await user.type(screen.getByPlaceholderText('Add a note, reminder, or motivation...'), 'x');
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(store.saveHabit).toHaveBeenCalledOnce());
    expect(store.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ questType: 'one_time', time: '09:30', timeSet: true, genre: 'article' }), 'o1');
  });

  it('keeps the stored date of an edited One-time quest, and lets it change while the quest is unfinished', async () => {
    const dated = { ...oneTimeQuest, scheduledDate: '2026-10-10' };
    setup(dated);
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={dated} onClose={vi.fn()} />);
    const date = screen.getByLabelText('DATE');
    expect(date).toBeEnabled();
    expect(date).toHaveValue('2026-10-10');
    expect(screen.queryByText(/date is fixed/i)).toBeNull();
    await user.type(screen.getByPlaceholderText('Add a note, reminder, or motivation...'), 'x');
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(store.saveHabit).toHaveBeenCalledOnce());
    expect(store.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ questType: 'one_time', scheduledDate: '2026-10-10' }), 'o1');
  });

  it('saves a new date for an unfinished quest', async () => {
    const dated = { ...oneTimeQuest, scheduledDate: '2026-10-10' };
    setup(dated);
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={dated} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('DATE'), { target: { value: '2099-02-03' } });
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(store.saveHabit).toHaveBeenCalledOnce());
    expect(store.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ scheduledDate: '2099-02-03' }), 'o1');
  });

  it('locks the date of a finished quest, explains why, and still saves its other edits', async () => {
    const done = { ...oneTimeQuest, scheduledDate: '2026-10-10', completed: true };
    setup(done);
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={done} onClose={vi.fn()} />);
    expect(screen.getByLabelText('DATE')).toBeDisabled();
    expect(screen.getByLabelText('DATE')).toHaveValue('2026-10-10');
    expect(screen.getByText(/date is fixed once the quest is finished/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'No date' })).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Add a note, reminder, or motivation...'), 'x');
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(store.saveHabit).toHaveBeenCalledOnce());
    expect(store.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ scheduledDate: '2026-10-10' }), 'o1');
  });

  it('opens an undated quest with No date checked and saves it undated, never inventing today', async () => {
    const undated = { ...oneTimeQuest, scheduledDate: null, timeSet: false, time: '08:00' };
    setup(undated);
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={undated} onClose={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'No date' })).toBeChecked();
    expect(screen.getByLabelText('DATE')).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Add a note, reminder, or motivation...'), 'x');
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(store.saveHabit).toHaveBeenCalledOnce());
    expect(store.saveHabit).toHaveBeenCalledWith(
      expect.objectContaining({ questType: 'one_time', scheduledDate: null, timeSet: false, time: '08:00' }), 'o1');
  });

  it('gives an undated quest a date once No date is unchecked', async () => {
    const undated = { ...oneTimeQuest, scheduledDate: null, timeSet: false };
    setup(undated);
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={undated} onClose={vi.fn()} />);
    await user.click(screen.getByRole('checkbox', { name: 'No date' }));
    expect(screen.getByLabelText('DATE')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('DATE'), { target: { value: '2099-05-06' } });
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(store.saveHabit).toHaveBeenCalledOnce());
    expect(store.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ scheduledDate: '2099-05-06' }), 'o1');
  });

  it('creates an undated One-time quest: no date, no set time, and the time is locked', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor initialType="one_time" onClose={vi.fn()} />);
    fireEvent.change(nameField(), { target: { value: 'Someday task' } });
    await user.click(screen.getByRole('checkbox', { name: 'No set time' }));
    fireEvent.change(screen.getByLabelText('TIME'), { target: { value: '10:15' } });
    await user.click(screen.getByRole('checkbox', { name: 'No date' }));
    expect(screen.getByLabelText('DATE')).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'No set time' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'No set time' })).toBeDisabled();
    expect(screen.getByLabelText('TIME')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(store.saveHabit).toHaveBeenCalledOnce());
    expect(store.saveHabit).toHaveBeenCalledWith(
      expect.objectContaining({ questType: 'one_time', scheduledDate: null, timeSet: false, time: '08:00' }), undefined);
  });

  it('lets the time be chosen again when a date comes back', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor initialType="one_time" onClose={vi.fn()} />);
    await user.click(screen.getByRole('checkbox', { name: 'No date' }));
    await user.click(screen.getByRole('checkbox', { name: 'No date' }));
    expect(screen.getByLabelText('DATE')).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'No set time' })).toBeEnabled();
  });

  it('offers No date only for a One-time quest', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor initialType="habit" onClose={vi.fn()} />);
    expect(screen.queryByRole('checkbox', { name: 'No date' })).toBeNull();
    await user.click(within(screen.getByRole('group', { name: 'Quest type' })).getByRole('button', { name: '1-Time' }));
    expect(screen.getByRole('checkbox', { name: 'No date' })).not.toBeChecked();
  });

  it('still lets the user pick the date while creating a One-time quest', async () => {
    render(<WebQuestEditor initialType="one_time" onClose={vi.fn()} />);
    const date = screen.getByLabelText('DATE');
    expect(date).toBeEnabled();
    fireEvent.change(date, { target: { value: '2099-01-02' } });
    expect(date).toHaveValue('2099-01-02');
    expect(screen.queryByText(/date is fixed/i)).toBeNull();
  });

  it('offers no type switch when editing, and no Penalty, Days or Time for Backlog', () => {
    setup(backlogQuest);
    render(<WebQuestEditor editingQuest={backlogQuest} onClose={vi.fn()} />);
    expect(screen.queryByRole('group', { name: 'Quest type' })).toBeNull();
    expect(screen.queryByText(/PENALTY/)).toBeNull();
    expect(screen.queryByText('DAYS')).toBeNull();
    expect(screen.queryByText('TIME')).toBeNull();
    expect(screen.queryByText('DATE')).toBeNull();
  });

  it('switches fields with the type while creating', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor initialType="habit" onClose={vi.fn()} />);
    const type = screen.getByRole('group', { name: 'Quest type' });
    expect(screen.getByText(/PENALTY/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Genre' })).toBeNull();
    await user.click(within(type).getByRole('button', { name: '1-Time' }));
    expect(screen.queryByText(/PENALTY/)).toBeNull();
    expect(screen.getByText('DATE')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Genre' })).toBeInTheDocument();
    await user.click(within(type).getByRole('button', { name: 'Backlog' }));
    expect(screen.queryByText('DATE')).toBeNull();
    expect(screen.getByText('NEW BACKLOG QUEST')).toBeInTheDocument();
  });

  it('creates a One-time quest with a genre and no set time by default', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor initialType="one_time" onClose={vi.fn()} />);
    fireEvent.change(nameField(), { target: { value: 'Read the RFC' } });
    await user.click(within(screen.getByRole('group', { name: 'Genre' })).getByRole('button', { name: 'Docs / article' }));
    await user.click(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(store.saveHabit).toHaveBeenCalledOnce());
    expect(store.saveHabit).toHaveBeenCalledWith(
      expect.objectContaining({ questType: 'one_time', genre: 'article', timeSet: false, easyVersion: null, days: [] }),
      undefined,
    );
  });

  it('uses the time when "No set time" is unchecked, and unselecting a genre clears it', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor initialType="one_time" onClose={vi.fn()} />);
    fireEvent.change(nameField(), { target: { value: 'Call the bank' } });
    const genre = within(screen.getByRole('group', { name: 'Genre' }));
    await user.click(genre.getByRole('button', { name: 'To-do' }));
    await user.click(genre.getByRole('button', { name: 'To-do' }));
    await user.click(screen.getByRole('checkbox', { name: 'No set time' }));
    fireEvent.change(screen.getByLabelText('TIME'), { target: { value: '10:15' } });
    await user.click(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(store.saveHabit).toHaveBeenCalledOnce());
    expect(store.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ time: '10:15', timeSet: true, genre: null }), undefined);
  });

  it('never saves a genre or an untimed flag for a habit, and still requires a penalty or a target', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor initialType="habit" onClose={vi.fn()} />);
    fireEvent.change(nameField(), { target: { value: 'Run' } });
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
    await user.type(screen.getByPlaceholderText('e.g. Walk for 10 min instead'), 'Walk');
    await user.click(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(store.saveHabit).toHaveBeenCalledOnce());
    expect(store.saveHabit).toHaveBeenCalledWith(
      expect.objectContaining({ questType: 'habit', easyVersion: 'Walk', genre: null, timeSet: true, scheduledDate: null }),
      undefined,
    );
  });

  it('offers Delete but not Archive for a Backlog quest', () => {
    setup(backlogQuest);
    render(<WebQuestEditor editingQuest={backlogQuest} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'ARCHIVE QUEST' })).toBeNull();
    expect(screen.getByRole('button', { name: 'DELETE PERMANENTLY' })).toBeInTheDocument();
  });
});
