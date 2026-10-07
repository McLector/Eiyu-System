// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type LongQuest } from '@eiyu/shared';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn(), toggleStage: vi.fn(), removeLongQuest: vi.fn(), saveLongQuest: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebLongQuests from '../WebLongQuests';
import { NavigationGuard } from '../../components/NavigationGuard';

afterEach(cleanup);

const stage = (id: string, name: string, done: boolean, description: string | null = null) => ({ id, name, done, description });
const chain = (over: Partial<LongQuest> = {}): LongQuest => ({
  id: 'c1', name: 'The crystal vault', stat: 'INT', description: null, completedAt: null, createdAt: '2026-09-12T08:30:00Z',
  stages: [stage('s1', 'Gather maps', true), stage('s2', 'Learn the cipher', false, 'Walk the dry terrain.'), stage('s3', 'Find the door', false, 'Behind the vault.')],
  ...over,
});

function setup(chains: LongQuest[]) {
  store.toggleStage.mockReset();
  store.saveLongQuest.mockReset().mockResolvedValue(undefined);
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', longQuests: chains }, stageRewardNotice: null, rewardReceipt: null,
    longQuestsLoading: false, longQuestsError: null, retryLongQuests: vi.fn(), toggleStage: store.toggleStage,
    removeLongQuest: store.removeLongQuest, saveLongQuest: store.saveLongQuest, pendingStageIds: [],
  });
  const router = createMemoryRouter([{ path: '/', element: <NavigationGuard><WebLongQuests /></NavigationGuard> }]);
  render(<RouterProvider router={router} />);
}

const panel = () => document.querySelector('.chain-panel') as HTMLElement;
const stageRows = () => Array.from(document.querySelectorAll<HTMLElement>('.chain-stage'));
const rowState = (row: HTMLElement) => row.className.match(/is-(done|current|open|locked)/)?.[1];
const orderStat = () => within(document.querySelector('.chain-stats') as HTMLElement).getByText('Order').nextElementSibling;

beforeEach(() => { Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true, writable: true }); });

describe('a chain done in any order', () => {
  it('shows every unfinished stage as open and none as locked', () => {
    setup([chain({ strictOrder: false })]);
    expect(stageRows().map(rowState)).toEqual(['done', 'open', 'open']);
    expect(stageRows().map(row => within(row).getByText(/^(Done|Open|Current|Locked)$/).textContent)).toEqual(['Done', 'Open', 'Open']);
    expect(within(panel()).queryByText(/Complete earlier stages first/)).toBeNull();
  });

  it('offers a named COMPLETE STAGE on each open stage, and completing a later one first works', async () => {
    const user = userEvent.setup();
    setup([chain({ strictOrder: false })]);
    const buttons = screen.getAllByRole('button', { name: /^COMPLETE STAGE: / });
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(['COMPLETE STAGE: Learn the cipher', 'COMPLETE STAGE: Find the door']);
    await user.click(screen.getByRole('button', { name: 'COMPLETE STAGE: Find the door' }));
    expect(store.toggleStage).toHaveBeenCalledExactlyOnceWith('c1', 's3');
  });

  it('lets any done stage be undone, even with a later stage done', async () => {
    const user = userEvent.setup();
    setup([chain({ strictOrder: false, stages: [stage('s1', 'Gather maps', true), stage('s2', 'Learn the cipher', true), stage('s3', 'Find the door', false)] })]);
    await user.click(within(panel()).getByRole('button', { name: 'Actions for Gather maps' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mark not done' }));
    expect(store.toggleStage).toHaveBeenCalledExactlyOnceWith('c1', 's1');
  });

  it('opens the details of the first open stage by default and keeps the others closed', () => {
    setup([chain({ strictOrder: false })]);
    expect(within(stageRows()[1]).getByText('Walk the dry terrain.')).toBeInTheDocument();
    expect(within(stageRows()[2]).queryByText('Behind the vault.')).toBeNull();
  });

  it('shows no COMPLETE STAGE once every stage is done', () => {
    setup([chain({ strictOrder: false, completedAt: '2026-09-28T10:00:00Z', stages: [stage('s1', 'Only', true)] })]);
    expect(screen.queryByRole('button', { name: /COMPLETE STAGE/ })).toBeNull();
    expect(stageRows().map(rowState)).toEqual(['done']);
  });
});

describe('a chain done in order', () => {
  it.each([[true], [undefined]])('keeps current and locked stages when strictOrder is %s', strictOrder => {
    setup([chain({ strictOrder })]);
    expect(stageRows().map(rowState)).toEqual(['done', 'current', 'locked']);
    expect(screen.getAllByRole('button', { name: 'COMPLETE STAGE' })).toHaveLength(1);
  });
});

describe('the Order stat', () => {
  it.each([[false, 'Any order'], [true, 'In order'], [undefined, 'In order']])('reads %s as %s', (strictOrder, text) => {
    setup([chain({ strictOrder })]);
    expect(orderStat()).toHaveTextContent(text);
  });
});

describe('the order option in the editor', () => {
  const gapped = (): LongQuest => chain({ id: 'g1', name: 'Gap chain', strictOrder: false, stages: [stage('g-1', 'First', true), stage('g-2', 'Second', false), stage('g-3', 'Third', true)] });
  const checkbox = () => screen.getByRole('checkbox', { name: 'Stages in order' }) as HTMLInputElement;

  async function openEditor(quest: LongQuest) {
    const user = userEvent.setup();
    setup([quest]);
    await user.click(screen.getByRole('button', { name: 'EDIT' }));
    return user;
  }

  it('is on by default for a new chain and is saved with it', async () => {
    const user = userEvent.setup();
    setup([]);
    await user.click(screen.getByRole('button', { name: /NEW QUEST/ }));
    expect(checkbox().checked).toBe(true);
    await user.type(screen.getByLabelText('Quest name'), 'Learn Rust');
    await user.type(screen.getByPlaceholderText('Stage 1...'), 'Book');
    await user.click(screen.getByRole('button', { name: 'CREATE' }));
    await waitFor(() => expect(store.saveLongQuest).toHaveBeenCalledOnce());
    expect(store.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ strictOrder: true }));
  });

  it('can be switched off for a new chain', async () => {
    const user = userEvent.setup();
    setup([]);
    await user.click(screen.getByRole('button', { name: /NEW QUEST/ }));
    await user.click(checkbox());
    await user.type(screen.getByLabelText('Quest name'), 'Learn Rust');
    await user.type(screen.getByPlaceholderText('Stage 1...'), 'Book');
    await user.click(screen.getByRole('button', { name: 'CREATE' }));
    await waitFor(() => expect(store.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ strictOrder: false })));
  });

  it('starts from the chain: unchecked for a chain done in any order, checked otherwise', async () => {
    await openEditor(chain({ strictOrder: false }));
    expect(checkbox().checked).toBe(false);
    cleanup();
    await openEditor(chain({ strictOrder: true }));
    expect(checkbox().checked).toBe(true);
    cleanup();
    await openEditor(chain());
    expect(checkbox().checked).toBe(true);
  });

  it('saves the changed mode with the quest id, and may always go from in order to any order', async () => {
    const user = await openEditor(chain({ strictOrder: true }));
    expect(checkbox()).toBeEnabled();
    await user.click(checkbox());
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(store.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ strictOrder: false }), 'c1'));
  });

  it('counts a changed mode as an unsaved edit', async () => {
    const user = await openEditor(chain({ strictOrder: true }));
    await user.click(checkbox());
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
  });

  it('cannot be turned on while a done stage follows an open one, and says why', async () => {
    await openEditor(gapped());
    expect(checkbox().checked).toBe(false);
    expect(checkbox()).toBeDisabled();
    expect(screen.getByText('Mark the later done stages not done first to keep stages in order.')).toBeInTheDocument();
  });

  it('can be turned on after the open stage that causes the gap is removed from the draft', async () => {
    const user = await openEditor(gapped());
    await user.click(screen.getByRole('button', { name: 'Remove stage 2' }));
    expect(checkbox()).toBeEnabled();
    expect(screen.queryByText('Mark the later done stages not done first to keep stages in order.')).toBeNull();
    await user.click(checkbox());
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(store.saveLongQuest).toHaveBeenCalledOnce());
    const [draft, id] = store.saveLongQuest.mock.calls[0];
    expect(id).toBe('g1');
    expect(draft).toMatchObject({ strictOrder: true });
    expect(draft.stages.map((s: { id: string }) => s.id)).toEqual(['g-1', 'g-3']);
  });

  it('stays enabled for a chain done in any order whose done stages are already a prefix', async () => {
    await openEditor(chain({ strictOrder: false, stages: [stage('s1', 'Gather maps', true), stage('s2', 'Learn', false)] }));
    expect(checkbox()).toBeEnabled();
  });
});
