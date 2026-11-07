// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type LongQuest } from '@eiyu/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The dialog reads no permission state: the store mock deliberately has no `tracker`, `audience`, `acceptTracker` or `refreshTracker`.
const mocks = vi.hoisted(() => ({ useEiyu: vi.fn(), saveLongQuest: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: mocks.useEiyu }));

import LongQuestEditorDialog from '../LongQuestEditorDialog';

afterEach(cleanup);

const chain = (over: Partial<LongQuest> = {}): LongQuest => ({
  id: 'c1', name: 'Plan', stat: 'INT', description: 'why', completedAt: null, strictOrder: true,
  stages: [{ id: 's1', name: 'First', done: false, description: null }, { id: 's2', name: 'Second', done: false, description: null }],
  ...over,
} as LongQuest);

function setup(chains: LongQuest[] = []) {
  mocks.saveLongQuest.mockReset().mockResolvedValue(undefined);
  mocks.useEiyu.mockReturnValue({ user: { ...initialUser, longQuests: chains }, saveLongQuest: mocks.saveLongQuest });
}
const nameField = () => screen.queryByLabelText('Quest name');

describe('new chain', () => {
  it('shows the normal fields and none of the old tracking or permission wording', () => {
    setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    expect(nameField()).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Note \(optional\)/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Stage 1...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Stage 2...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use basic tracking' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use custom details' })).not.toBeInTheDocument();
    expect(screen.queryByText(/neutral names/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/permission/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/paused for this account/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Read-only quest' })).not.toBeInTheDocument();
  });

  it('requires a chain name and a stage name, then sends custom-mode values', async () => {
    setup();
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'CREATE' })).toBeDisabled();
    await user.type(nameField()!, 'Launch');
    expect(screen.getByRole('button', { name: 'CREATE' })).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Stage 1...'), 'Draft');
    await user.click(screen.getByRole('button', { name: 'CREATE' }));
    await waitFor(() => expect(mocks.saveLongQuest).toHaveBeenCalledOnce());
    expect(mocks.saveLongQuest.mock.calls[0][0]).toEqual({ mode: 'custom', values: expect.objectContaining({ name: 'Launch', stages: [{ name: 'Draft', description: '' }] }) });
    expect(mocks.saveLongQuest.mock.calls[0][1]).toBeUndefined();
  });

  it('cannot be created with stage names but no chain name', async () => {
    setup();
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('Stage 1...'), 'Draft');
    expect(screen.getByRole('button', { name: 'CREATE' })).toBeDisabled();
    expect(mocks.saveLongQuest).not.toHaveBeenCalled();
  });

  it('rejects a 200-character name with the existing validation message and sends nothing', async () => {
    setup();
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    await user.click(nameField()!);
    await user.paste('x'.repeat(200));
    await user.type(screen.getByPlaceholderText('Stage 1...'), 'Draft');
    expect(await screen.findByRole('alert')).toHaveTextContent(/\S/);
    expect(screen.getByRole('button', { name: 'CREATE' })).toBeDisabled();
    expect(mocks.saveLongQuest).not.toHaveBeenCalled();
  });

  it('keeps the draft, shows the reason and moves focus to it when the save is refused', async () => {
    setup();
    mocks.saveLongQuest.mockRejectedValue(new Error('This record changed, so nothing was saved.'));
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

  it('keeps two-row stage descriptions so large text still fits', () => {
    setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    for (const box of screen.getAllByLabelText(/Stage \d description/)) expect(box).toHaveAttribute('rows', '2');
  });
});

describe('chains saved under the old permission rules', () => {
  it('opens a chain with no inputKind as a normal, editable chain', async () => {
    const quest = chain();
    setup([quest]);
    const user = userEvent.setup();
    render(<LongQuestEditorDialog quest={quest} onClose={vi.fn()} />);
    expect(screen.queryByRole('group', { name: 'Read-only quest' })).not.toBeInTheDocument();
    expect(nameField()).toBeEnabled();
    expect(nameField()).toHaveValue('Plan');
    await user.type(nameField()!, '!');
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mocks.saveLongQuest).toHaveBeenCalledOnce());
    expect(mocks.saveLongQuest).toHaveBeenCalledWith({ mode: 'custom', values: expect.objectContaining({ name: 'Plan!' }) }, 'c1');
  });

  it('opens a custom chain the server marked unwritable as editable', () => {
    const quest = chain({ inputKind: 'custom', canWrite: false });
    setup([quest]);
    render(<LongQuestEditorDialog quest={quest} onClose={vi.fn()} />);
    expect(screen.queryByRole('group', { name: 'Read-only quest' })).not.toBeInTheDocument();
    expect(nameField()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'SAVE CHANGES' })).toBeInTheDocument();
  });

  it('shows names and stage text for a stored basic chain and saves it as a normal chain, keeping stage ids', async () => {
    const quest = chain({ name: 'Chain 1', inputKind: 'basic', canWrite: true, description: undefined,
      stages: [{ id: 's1', name: 'Stage 1', done: false, description: null }, { id: 's2', name: 'Stage 2', done: false, description: null }] });
    setup([quest]);
    const user = userEvent.setup();
    render(<LongQuestEditorDialog quest={quest} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Use basic tracking' })).not.toBeInTheDocument();
    expect(screen.queryByText(/neutral names/i)).not.toBeInTheDocument();
    expect(nameField()).toHaveValue('Chain 1');
    expect(screen.getByPlaceholderText('Stage 1...')).toHaveValue('Stage 1');
    await user.click(screen.getByRole('button', { name: 'Remove stage 2' }));
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mocks.saveLongQuest).toHaveBeenCalledOnce());
    expect(mocks.saveLongQuest).toHaveBeenCalledWith(
      { mode: 'custom', values: expect.objectContaining({ name: 'Chain 1', stages: [{ id: 's1', name: 'Stage 1', description: null }] }) }, 'c1');
  });

  it('shows the name field for a legacy chain with no name and saves the new name', async () => {
    const quest = chain({ name: '', inputKind: 'basic', canWrite: true });
    setup([quest]);
    const user = userEvent.setup();
    render(<LongQuestEditorDialog quest={quest} onClose={vi.fn()} />);
    expect(nameField()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'SAVE CHANGES' })).toBeDisabled();
    await user.type(nameField()!, 'Real name');
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(mocks.saveLongQuest).toHaveBeenCalledWith({ mode: 'custom', values: expect.objectContaining({ name: 'Real name' }) }, 'c1'));
  });
});
