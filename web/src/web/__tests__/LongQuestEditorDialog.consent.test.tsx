// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type LongQuest, type TrackerAccess } from '@eiyu/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useEiyu: vi.fn(), saveLongQuest: vi.fn(), acceptTracker: vi.fn(), refreshTracker: vi.fn(), setConsent: vi.fn(),
}));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: mocks.useEiyu }));
vi.mock('@eiyu/shared', async importOriginal => {
  return {
    ...await importOriginal<typeof import('@eiyu/shared')>(),
    setTrackerConsent: (...args: unknown[]) => mocks.setConsent(...args),
    trackerErrorKind: () => null,
  };
});

import LongQuestEditorDialog from '../LongQuestEditorDialog';
import { TRACKER_PURPOSE_NOTICES as NOTICES } from '@eiyu/shared';
import { noGrant, trackerAccess } from '../../test/tracker-fixtures';

afterEach(cleanup);

const chain = (over: Partial<LongQuest> = {}): LongQuest => ({
  id: 'c1', name: 'Plan', stat: 'INT', description: 'why', completedAt: null, strictOrder: true,
  stages: [{ id: 's1', name: 'First', done: false, description: null }, { id: 's2', name: 'Second', done: false, description: null }],
  ...over,
} as LongQuest);

function setup(tracker: TrackerAccess | null, chains: LongQuest[] = []) {
  mocks.saveLongQuest.mockReset().mockResolvedValue(undefined);
  mocks.acceptTracker.mockReset(); mocks.refreshTracker.mockReset(); mocks.setConsent.mockReset();
  mocks.useEiyu.mockReturnValue({
    user: { ...initialUser, longQuests: chains }, tracker, saveLongQuest: mocks.saveLongQuest,
    acceptTracker: mocks.acceptTracker, refreshTracker: mocks.refreshTracker,
  });
}
const nameField = () => screen.queryByLabelText('Quest name');

describe('new chain without custom permission', () => {
  it('starts basic: no names, notes or stage text, and nothing is sent on mount', () => {
    setup(noGrant());
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Use basic tracking' })).toHaveAttribute('aria-pressed', 'true');
    expect(nameField()).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Note \(optional\)/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Stage 1...')).not.toBeInTheDocument();
    expect(screen.getByText('Stage 1')).toBeInTheDocument();
    expect(screen.getByText('Stage 2')).toBeInTheDocument();
    expect(mocks.saveLongQuest).not.toHaveBeenCalled();
    expect(mocks.setConsent).not.toHaveBeenCalled();
  });

  it('creates a basic chain from stage count and attribute only', async () => {
    setup(noGrant());
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '+ Add stage' }));
    await user.click(screen.getByRole('button', { name: 'CREATE' }));
    await waitFor(() => expect(mocks.saveLongQuest).toHaveBeenCalledOnce());
    const [editor, existingId] = mocks.saveLongQuest.mock.calls[0];
    expect(editor.mode).toBe('basic');
    expect(editor.values.stages).toHaveLength(3);
    expect(editor.values.stat).toBe('INT');
    expect(JSON.stringify(editor.values)).not.toMatch(/name|description/);
    expect(existingId).toBeUndefined();
  });

  it('shows the custom notice before any input is accepted, and declining returns to basic', async () => {
    setup(noGrant());
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Use custom details' }));
    expect(screen.getByText(NOTICES['custom-tracker'].body)).toBeInTheDocument();
    expect(nameField()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CREATE' })).toBeDisabled();
    expect(mocks.setConsent).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Keep basic tracking' }));
    expect(screen.getByRole('button', { name: 'Use basic tracking' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'CREATE' }));
    await waitFor(() => expect(mocks.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ mode: 'basic' })));
  });

  it('records a grant only from the explicit agree button', async () => {
    setup(noGrant());
    const granted = trackerAccess({}, 'owner-a');
    mocks.setConsent.mockResolvedValue(granted);
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Use custom details' }));
    await user.click(screen.getByRole('button', { name: NOTICES['custom-tracker'].label }));
    await waitFor(() => expect(mocks.acceptTracker).toHaveBeenCalledWith(granted));
    expect(mocks.setConsent).toHaveBeenCalledWith('custom-tracker', true, NOTICES['custom-tracker'].version, noGrant().revision);
    expect(mocks.saveLongQuest).not.toHaveBeenCalled();
  });
});

describe('new chain with custom permission', () => {
  it('requires a chain name and a stage name, then sends mode custom', async () => {
    setup(trackerAccess({}, 'owner-a'));
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'CREATE' })).toBeDisabled();
    await user.type(nameField()!, 'Launch');
    expect(screen.getByRole('button', { name: 'CREATE' })).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Stage 1...'), 'Draft');
    await user.click(screen.getByRole('button', { name: 'CREATE' }));
    await waitFor(() => expect(mocks.saveLongQuest).toHaveBeenCalledOnce());
    expect(mocks.saveLongQuest.mock.calls[0][0]).toEqual({ mode: 'custom', values: expect.objectContaining({ name: 'Launch', stages: [{ name: 'Draft', description: '' }] }) });
  });

  it('never leaks typed text into a basic save', async () => {
    setup(trackerAccess({}, 'owner-a'));
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    await user.type(nameField()!, 'Private plan');
    await user.type(screen.getByPlaceholderText('Stage 1...'), 'Secret step');
    await user.click(screen.getByRole('button', { name: 'Use basic tracking' }));
    await user.click(screen.getByRole('button', { name: 'CREATE' }));
    await waitFor(() => expect(mocks.saveLongQuest).toHaveBeenCalledOnce());
    expect(JSON.stringify(mocks.saveLongQuest.mock.calls[0][0])).not.toMatch(/Private plan|Secret step/);
  });

  it('keeps the draft, shows the reason and moves focus to it when the save is refused', async () => {
    setup(trackerAccess({}, 'owner-a'));
    mocks.saveLongQuest.mockRejectedValue(new Error('Your permissions or this record changed, so nothing was saved.'));
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    await user.type(nameField()!, 'Launch');
    await user.type(screen.getByPlaceholderText('Stage 1...'), 'Draft');
    await user.click(screen.getByRole('button', { name: 'CREATE' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/nothing was saved/);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(nameField()).toHaveValue('Launch');
    expect(mocks.saveLongQuest).toHaveBeenCalledTimes(1);
  });

  it('keeps two-row stage descriptions in custom mode so large text still fits', () => {
    setup(trackerAccess({}, 'owner-a'));
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    for (const box of screen.getAllByLabelText(/Stage \d description/)) expect(box).toHaveAttribute('rows', '2');
  });
});

describe('existing chains', () => {
  it('shows a custom chain without permission as read-only with a reason and no save path', () => {
    const quest = chain({ inputKind: 'custom', canWrite: false });
    setup(noGrant(), [quest]);
    render(<LongQuestEditorDialog quest={quest} onClose={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Read-only quest' })).toHaveTextContent(/read-only until custom tracker permission/i);
    expect(nameField()).toHaveValue('Plan');
    expect(nameField()).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'SAVE CHANGES' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: NOTICES['custom-tracker'].label })).toBeInTheDocument();
    expect(mocks.saveLongQuest).not.toHaveBeenCalled();
  });

  it('treats an unclassified chain as read-only', () => {
    const quest = chain();
    setup(trackerAccess({}, 'owner-a'), [quest]);
    render(<LongQuestEditorDialog quest={quest} onClose={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Read-only quest' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'SAVE CHANGES' })).not.toBeInTheDocument();
  });

  it('edits a basic chain as basic and keeps its stage ids', async () => {
    const quest = chain({ inputKind: 'basic', canWrite: true });
    setup(noGrant(), [quest]);
    const user = userEvent.setup();
    render(<LongQuestEditorDialog quest={quest} onClose={vi.fn()} />);
    expect(nameField()).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove stage 2' }));
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mocks.saveLongQuest).toHaveBeenCalledOnce());
    expect(mocks.saveLongQuest).toHaveBeenCalledWith({ mode: 'basic', values: { stat: 'INT', strictOrder: true, stages: [{ id: 's1' }] } }, 'c1');
  });
});

describe('age-appropriate custom notice in the prompt', () => {
  const withAudience = (audience?: 'teen' | 'adult') => mocks.useEiyu.mockReturnValue({ ...mocks.useEiyu(), audience });
  const open = async () => {
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
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
});
