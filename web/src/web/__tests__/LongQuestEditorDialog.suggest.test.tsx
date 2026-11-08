// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { initialUser, type LongQuest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useEiyu: vi.fn(), saveLongQuest: vi.fn(),
  fetchProcessingAccess: vi.fn(), fetchMailboxStatus: vi.fn(), suggestStages: vi.fn(),
  accessListeners: new Set<() => void>(), mailboxListeners: new Set<() => void>(),
}));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: mocks.useEiyu }));
vi.mock('@eiyu/shared', async importActual => {
  const actual = await importActual<typeof import('@eiyu/shared')>();
  return {
    ...actual,
    fetchProcessingAccess: mocks.fetchProcessingAccess,
    fetchMailboxStatus: mocks.fetchMailboxStatus,
    suggestStages: mocks.suggestStages,
    subscribeProcessingAccessChanges: (l: () => void) => { mocks.accessListeners.add(l); return () => { mocks.accessListeners.delete(l); }; },
    subscribeMailboxChanges: (l: () => void) => { mocks.mailboxListeners.add(l); return () => { mocks.mailboxListeners.delete(l); }; },
  };
});

import LongQuestEditorDialog from '../LongQuestEditorDialog';

const access = (over: Record<string, unknown> = {}) => ({ contractVersion: 1, userId: 'user-1', ageVersion: 1, consentVersion: 2, authorityVersion: 0,
  mailboxVersion: 1, ageEligible: true, ageConsent: true, aiConsent: true, canReadDebrief: true, canGenerateDebrief: true, authorityState: 'not-required', ...over });
const mailbox = (over: Record<string, unknown> = {}) => ({ userId: 'user-1', version: 1, verified: true, challenge: null, ...over });
const chain = (): LongQuest => ({ id: 'c1', name: 'Plan', stat: 'INT', description: null, completedAt: null, strictOrder: true,
  stages: [{ id: 's1', name: 'First', done: true, description: null }, { id: 's2', name: 'Second', done: false, description: null }] } as LongQuest);

beforeEach(() => {
  mocks.useEiyu.mockReturnValue({ user: { ...initialUser, longQuests: [] }, saveLongQuest: mocks.saveLongQuest });
  mocks.fetchProcessingAccess.mockReset().mockResolvedValue(access());
  mocks.fetchMailboxStatus.mockReset().mockResolvedValue(mailbox());
  mocks.suggestStages.mockReset().mockResolvedValue(['Pick a route', 'Walk it once', 'Finish it']);
});
afterEach(() => { cleanup(); mocks.accessListeners.clear(); mocks.mailboxListeners.clear(); });

const button = () => screen.queryByRole('button', { name: /suggest stages/i });
const stageFields = () => screen.getAllByPlaceholderText(/^Stage \d+\.\.\.$/) as HTMLInputElement[];

describe('Suggest stages button', () => {
  it('is shown to a person with the 18+ box, the AI agreement and a verified email', async () => {
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /suggest stages/i })).toBeInTheDocument();
    expect(screen.getByText(/sends this chain's name and stat to groq/i)).toBeInTheDocument();
  });

  it.each([
    ['AI is off', () => mocks.fetchProcessingAccess.mockResolvedValue(access({ aiConsent: false, canGenerateDebrief: false }))],
    ['the 18+ box is not ticked', () => mocks.fetchProcessingAccess.mockResolvedValue(access({ ageEligible: false, ageConsent: false, canReadDebrief: false, canGenerateDebrief: false }))],
    ['the email is not verified', () => mocks.fetchMailboxStatus.mockResolvedValue(mailbox({ verified: false }))],
    ['access belongs to another account', () => mocks.fetchMailboxStatus.mockResolvedValue(mailbox({ userId: 'user-2' }))],
    ['access cannot be read', () => mocks.fetchProcessingAccess.mockRejectedValue(new Error('offline'))],
  ])('is absent when %s, and the dialog still works', async (_label, arrange) => {
    arrange();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.fetchProcessingAccess).toHaveBeenCalled());
    await waitFor(() => expect(mocks.fetchMailboxStatus).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 20));
    expect(button()).not.toBeInTheDocument();
    expect(screen.queryByText(/groq/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Quest name')).toBeInTheDocument();
  });

  it('appears when the access card is completed and goes away when AI is turned off', async () => {
    mocks.fetchProcessingAccess.mockResolvedValue(access({ aiConsent: false, canGenerateDebrief: false }));
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.fetchProcessingAccess).toHaveBeenCalledTimes(1));
    expect(button()).not.toBeInTheDocument();
    mocks.fetchProcessingAccess.mockResolvedValue(access());
    mocks.accessListeners.forEach(l => l());
    expect(await screen.findByRole('button', { name: /suggest stages/i })).toBeInTheDocument();
    mocks.fetchProcessingAccess.mockResolvedValue(access({ aiConsent: false, canGenerateDebrief: false }));
    mocks.accessListeners.forEach(l => l());
    await waitFor(() => expect(button()).not.toBeInTheDocument());
  });

  it('is disabled until the chain has a name, and sends nothing while it is blank', async () => {
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    const suggest = await screen.findByRole('button', { name: /suggest stages/i });
    expect(suggest).toBeDisabled();
    await user.type(screen.getByLabelText('Quest name'), 'Finish a long hike');
    expect(suggest).toBeEnabled();
    expect(mocks.suggestStages).not.toHaveBeenCalled();
  });

  it('asks with the name, the stat and the access it just read, then fills the empty stage rows first', async () => {
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    await user.type(screen.getByLabelText('Quest name'), 'Finish a long hike');
    await user.click(await screen.findByRole('button', { name: /suggest stages/i }));
    await waitFor(() => expect(mocks.suggestStages).toHaveBeenCalledOnce());
    expect(mocks.suggestStages).toHaveBeenCalledWith('Finish a long hike', 'INT', { access: access(), mailbox: { userId: 'user-1', version: 1 } });
    await waitFor(() => expect(stageFields().map(f => f.value)).toEqual(['Pick a route', 'Walk it once', 'Finish it']));
  });

  it('never overwrites a stage the person already typed, and adds rows for the rest', async () => {
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    await user.type(screen.getByLabelText('Quest name'), 'Finish a long hike');
    await user.type(screen.getByPlaceholderText('Stage 1...'), 'My own first step');
    await user.click(await screen.findByRole('button', { name: /suggest stages/i }));
    await waitFor(() => expect(stageFields().map(f => f.value)).toEqual(['My own first step', 'Pick a route', 'Walk it once', 'Finish it']));
  });

  it('does not touch done stages when editing an existing chain, and appends after them', async () => {
    const user = userEvent.setup();
    render(<LongQuestEditorDialog quest={chain()} onClose={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /suggest stages/i }));
    await waitFor(() => expect(stageFields().map(f => f.value)).toEqual(['First', 'Second', 'Pick a route', 'Walk it once', 'Finish it']));
  });

  it('shows the server message when the request is refused, and leaves the stages alone', async () => {
    mocks.suggestStages.mockRejectedValue(new Error('Your daily AI limit has been reached. Please try again later.'));
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    await user.type(screen.getByLabelText('Quest name'), 'Finish a long hike');
    await user.click(await screen.findByRole('button', { name: /suggest stages/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your daily AI limit has been reached. Please try again later.');
    expect(stageFields().map(f => f.value)).toEqual(['', '']);
    expect(screen.getByRole('button', { name: /suggest stages/i })).toBeEnabled();
  });

  it('ignores a second press while a request is running', async () => {
    let resolve!: (v: string[]) => void;
    mocks.suggestStages.mockReturnValue(new Promise<string[]>(r => { resolve = r; }));
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    await user.type(screen.getByLabelText('Quest name'), 'Finish a long hike');
    const suggest = await screen.findByRole('button', { name: /suggest stages/i });
    await user.click(suggest);
    await waitFor(() => expect(screen.getByRole('button', { name: /suggesting/i })).toBeDisabled());
    await user.click(screen.getByRole('button', { name: /suggesting/i }));
    expect(mocks.suggestStages).toHaveBeenCalledOnce();
    resolve(['One']);
    await waitFor(() => expect(stageFields()[0].value).toBe('One'));
  });

  // The app runs inside React.StrictMode, which mounts, unmounts and remounts every component once in development.
  // The dialog must still use the answer (or show the failure) afterwards.
  it('fills the stage rows under StrictMode', async () => {
    const user = userEvent.setup();
    render(<StrictMode><LongQuestEditorDialog onClose={vi.fn()} /></StrictMode>);
    await user.type(screen.getByLabelText('Quest name'), 'Finish a long hike');
    await user.click(await screen.findByRole('button', { name: /suggest stages/i }));
    await waitFor(() => expect(stageFields().map(f => f.value)).toEqual(['Pick a route', 'Walk it once', 'Finish it']));
    expect(screen.getByRole('button', { name: /suggest stages/i })).toBeEnabled();
  });

  it('shows a refusal and re-enables the button under StrictMode', async () => {
    mocks.suggestStages.mockRejectedValue(new Error('Your daily AI limit has been reached. Please try again later.'));
    const user = userEvent.setup();
    render(<StrictMode><LongQuestEditorDialog onClose={vi.fn()} /></StrictMode>);
    await user.type(screen.getByLabelText('Quest name'), 'Finish a long hike');
    await user.click(await screen.findByRole('button', { name: /suggest stages/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your daily AI limit has been reached. Please try again later.');
    expect(screen.getByRole('button', { name: /suggest stages/i })).toBeEnabled();
  });

  it('does not save anything by itself, and the suggestions are an ordinary draft', async () => {
    const user = userEvent.setup();
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    await user.type(screen.getByLabelText('Quest name'), 'Finish a long hike');
    await user.click(await screen.findByRole('button', { name: /suggest stages/i }));
    await waitFor(() => expect(stageFields()[0].value).toBe('Pick a route'));
    expect(mocks.saveLongQuest).not.toHaveBeenCalled();
    await user.clear(stageFields()[0]);
    await user.type(stageFields()[0], 'Edited by me');
    expect(stageFields()[0].value).toBe('Edited by me');
  });
});
