// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type Quest, type TrackerAccess } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useEiyu: vi.fn(), saveHabit: vi.fn(), archiveQuest: vi.fn(), restoreQuest: vi.fn(), deleteQuest: vi.fn(),
  acceptTracker: vi.fn(), refreshTracker: vi.fn(), setConsent: vi.fn(),
}));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: mocks.useEiyu }));
vi.mock('@eiyu/shared', async importOriginal => {
  return {
    ...await importOriginal<typeof import('@eiyu/shared')>(),
    setTrackerConsent: (...args: unknown[]) => mocks.setConsent(...args),
    trackerErrorKind: () => null,
  };
});

import WebQuestEditor from '../WebQuestEditor';
import { TRACKER_PURPOSE_NOTICES as NOTICES } from '@eiyu/shared';
import { noGrant, trackerAccess } from '../../test/tracker-fixtures';

afterEach(cleanup);

const base: Quest = {
  id: 'q1', name: 'Morning walk', stat: 'STR', difficulty: 'Medium', easyVersion: 'Walk a minute', description: 'note',
  questType: 'habit', archived: false, time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0, frozen: false, completed: false,
  targetCount: null, progressCount: 0,
};
const customQuest: Quest = { ...base, inputKind: 'custom', canWrite: true };
const basicQuest: Quest = { ...base, name: 'Quest 1', description: null, easyVersion: null, inputKind: 'basic', canWrite: true, targetCount: 3 };
const legacyQuest: Quest = { ...base };

function setup(tracker: TrackerAccess | null, quests: Quest[] = []) {
  mocks.saveHabit.mockReset().mockResolvedValue(undefined);
  mocks.acceptTracker.mockReset(); mocks.refreshTracker.mockReset(); mocks.setConsent.mockReset();
  mocks.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', quests, longQuests: [] }, backlog: [], tracker,
    saveHabit: mocks.saveHabit, archiveQuest: mocks.archiveQuest, restoreQuest: mocks.restoreQuest, deleteQuest: mocks.deleteQuest,
    acceptTracker: mocks.acceptTracker, refreshTracker: mocks.refreshTracker,
  });
}
const nameField = () => screen.queryByPlaceholderText('e.g. Morning run for 30 min');

describe('new quest without custom permission', () => {
  beforeEach(() => setup(noGrant()));

  it('starts as basic tracking: no free-text fields, no notice, nothing sent on mount', () => {
    render(<WebQuestEditor onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Use basic tracking' })).toHaveAttribute('aria-pressed', 'true');
    expect(nameField()).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Add a note, reminder, or motivation...')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g. Walk for 10 min instead')).not.toBeInTheDocument();
    expect(screen.getByText(/neutral name/i)).toBeInTheDocument();
    expect(screen.queryByText(NOTICES['custom-tracker'].body)).not.toBeInTheDocument();
    expect(mocks.saveHabit).not.toHaveBeenCalled();
    expect(mocks.setConsent).not.toHaveBeenCalled();
  });

  it('saves a basic habit with only structured fields and no text keys', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(mocks.saveHabit).toHaveBeenCalledOnce());
    const [editor, existingId] = mocks.saveHabit.mock.calls[0];
    expect(editor).toEqual({ mode: 'basic', values: expect.objectContaining({ questType: 'habit', stat: 'INT', difficulty: 'Medium', days: expect.any(Array), time: '07:00' }) });
    for (const key of ['name', 'description', 'easyVersion', 'genre']) expect(editor.values).not.toHaveProperty(key);
    expect(existingId).toBeUndefined();
  });

  it('shows the custom notice before any input is accepted, and declining returns to basic', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Use custom details' }));
    expect(screen.getByText(NOTICES['custom-tracker'].body)).toBeInTheDocument();
    expect(nameField()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
    expect(mocks.setConsent).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Keep basic tracking' }));
    expect(screen.getByRole('button', { name: 'Use basic tracking' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(NOTICES['custom-tracker'].body)).not.toBeInTheDocument();
    expect(mocks.setConsent).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(mocks.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ mode: 'basic' }), undefined));
  });

  it('records a grant only from the explicit agree button and hands the server answer to the store', async () => {
    const granted = trackerAccess({}, 'owner-a');
    mocks.setConsent.mockResolvedValue(granted);
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Use custom details' }));
    await user.click(screen.getByRole('button', { name: NOTICES['custom-tracker'].label }));
    await waitFor(() => expect(mocks.acceptTracker).toHaveBeenCalledWith(granted));
    expect(mocks.setConsent).toHaveBeenCalledWith('custom-tracker', true, NOTICES['custom-tracker'].version, noGrant().revision);
    expect(mocks.saveHabit).not.toHaveBeenCalled();
  });

  it('does not send a typed draft while permission is missing', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Use custom details' }));
    await user.keyboard('{Enter}');
    expect(mocks.saveHabit).not.toHaveBeenCalled();
  });

  it('keeps the two mode buttons reachable and operable from the keyboard', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    screen.getByRole('button', { name: 'Use custom details' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Use custom details' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('group', { name: 'Tracking style' })).toBeInTheDocument();
  });
});

describe('new quest with custom permission', () => {
  beforeEach(() => setup(trackerAccess({}, 'owner-a')));

  it('keeps the existing custom form and sends mode custom with a name', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    await user.type(nameField()!, 'Stretch');
    await user.type(screen.getByPlaceholderText('e.g. Walk for 10 min instead'), 'One stretch');
    await user.click(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(mocks.saveHabit).toHaveBeenCalledOnce());
    expect(mocks.saveHabit.mock.calls[0][0]).toEqual({ mode: 'custom', values: expect.objectContaining({ name: 'Stretch', easyVersion: 'One stretch' }) });
  });

  it('never leaks an already typed name into a basic save', async () => {
    const user = userEvent.setup();
    render(<WebQuestEditor onClose={vi.fn()} />);
    await user.type(nameField()!, 'Private thing');
    await user.type(screen.getByPlaceholderText('Add a note, reminder, or motivation...'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Use basic tracking' }));
    expect(nameField()).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'CREATE QUEST' }));
    await waitFor(() => expect(mocks.saveHabit).toHaveBeenCalledOnce());
    const { values } = mocks.saveHabit.mock.calls[0][0];
    expect(JSON.stringify(values)).not.toMatch(/Private thing|secret/);
    for (const key of ['name', 'description', 'easyVersion', 'genre']) expect(values).not.toHaveProperty(key);
  });

  it('keeps the typed draft and focuses the error when the save is refused, without retrying', async () => {
    mocks.saveHabit.mockRejectedValue(new Error('Your permissions or this record changed, so nothing was saved.'));
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

describe('paused account', () => {
  it('refuses to save and says why', async () => {
    setup(trackerAccess({ canWriteBasic: false, canWriteCustom: false }, 'owner-a'));
    render(<WebQuestEditor onClose={vi.fn()} />);
    expect(screen.getByText(/paused for this account/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
  });
});

describe('existing quests', () => {
  it('shows a custom quest without permission as read-only with a reason and no write path', () => {
    setup(noGrant(), [{ ...customQuest, canWrite: false }]);
    render(<WebQuestEditor editingQuest={{ ...customQuest, canWrite: false }} onClose={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Read-only quest' })).toHaveTextContent(/read-only until custom tracker permission/i);
    expect(nameField()).toHaveValue('Morning walk');
    expect(nameField()).toBeDisabled();
    for (const name of ['SAVE CHANGES', 'ARCHIVE QUEST', 'DELETE PERMANENTLY', 'RESTORE QUEST']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: NOTICES['custom-tracker'].label })).toBeInTheDocument();
    expect(mocks.saveHabit).not.toHaveBeenCalled();
  });

  it('treats an unclassified (legacy) quest as read-only even with custom permission', () => {
    setup(trackerAccess({}, 'owner-a'), [legacyQuest]);
    render(<WebQuestEditor editingQuest={legacyQuest} onClose={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Read-only quest' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'SAVE CHANGES' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ARCHIVE QUEST' })).not.toBeInTheDocument();
  });

  it('edits a basic quest as basic without custom permission, with no text fields', async () => {
    setup(noGrant(), [basicQuest]);
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={basicQuest} onClose={vi.fn()} />);
    expect(nameField()).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mocks.saveHabit).toHaveBeenCalledOnce());
    expect(mocks.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ mode: 'basic' }), 'q1');
  });

  it('lets a writable custom quest keep its custom form and sends mode custom', async () => {
    setup(trackerAccess({}, 'owner-a'), [customQuest]);
    const user = userEvent.setup();
    render(<WebQuestEditor editingQuest={customQuest} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Use basic tracking' })).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Add a note, reminder, or motivation...'), '!');
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mocks.saveHabit).toHaveBeenCalledWith(expect.objectContaining({ mode: 'custom' }), 'q1'));
  });
});

describe('age-appropriate custom notice in the prompt', () => {
  const withAudience = (audience?: 'teen' | 'adult') => mocks.useEiyu.mockReturnValue({ ...mocks.useEiyu(), audience });
  const open = async () => {
    render(<WebQuestEditor onClose={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Use custom details' }));
  };

  it('shows the 12-17 explanation to a teen', async () => {
    setup(noGrant()); withAudience('teen');
    await open();
    expect(screen.getByText(NOTICES['custom-tracker'].childBody)).toBeInTheDocument();
    expect(screen.queryByText(NOTICES['custom-tracker'].body)).not.toBeInTheDocument();
  });

  it.each([['adult', 'adult' as const], ['unknown', undefined]])('shows the adult notice for %s', async (_name, audience) => {
    setup(noGrant()); withAudience(audience);
    await open();
    expect(screen.getByText(NOTICES['custom-tracker'].body)).toBeInTheDocument();
    expect(screen.queryByText(NOTICES['custom-tracker'].childBody)).not.toBeInTheDocument();
  });

  it('shows the 12-17 explanation in the read-only existing-quest prompt too', () => {
    setup(noGrant(), [{ ...customQuest, canWrite: false }]); withAudience('teen');
    render(<WebQuestEditor editingQuest={{ ...customQuest, canWrite: false }} onClose={vi.fn()} />);
    expect(screen.getByText(NOTICES['custom-tracker'].childBody)).toBeInTheDocument();
  });
});
