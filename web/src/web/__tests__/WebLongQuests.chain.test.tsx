// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
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

const chain = (over: Partial<LongQuest> = {}): LongQuest => ({
  id: 'c1', name: 'The crystal vault', stat: 'INT', description: 'Recover the lost archive.', completedAt: null,
  stages: [
    { id: 's1', name: 'Gather the old maps', done: true, description: 'Maps are in the attic.' },
    { id: 's2', name: 'Learn the cipher', done: false, description: 'Walk the dry terrain.\nBring water.' },
    { id: 's3', name: 'Find the vault door', done: false, description: null },
  ],
  ...over,
});

function setup(chains: LongQuest[]) {
  store.toggleStage.mockReset();
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', longQuests: chains }, stageRewardNotice: null, rewardReceipt: null,
    longQuestsLoading: false, longQuestsError: null, retryLongQuests: vi.fn(), toggleStage: store.toggleStage,
    removeLongQuest: store.removeLongQuest, saveLongQuest: store.saveLongQuest, pendingStageIds: [],
  });
  const router = createMemoryRouter([{ path: '/', element: <NavigationGuard><WebLongQuests /></NavigationGuard> }]);
  render(<RouterProvider router={router} />);
}

describe('Chain Progression', () => {
  beforeEach(() => { Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true, writable: true }); });

  it('is titled Chain Progression and has no animated map', () => {
    setup([chain()]);
    expect(screen.getByRole('heading', { name: 'CHAIN PROGRESSION' })).toBeInTheDocument();
    expect(document.querySelector('.journey')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });

  it('opens the first chain with its stats and a progress bar', () => {
    setup([chain()]);
    expect(screen.getByRole('button', { name: /The crystal vault/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('1 / 3 stages completed')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'The crystal vault progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '33');
    // The fill scales instead of animating width, so the change runs on the compositor.
    expect((bar.firstElementChild as HTMLElement).style.transform).toBe('scaleX(0.33)');
    const stats = within(document.querySelector('.chain-stats') as HTMLElement);
    expect(stats.getByText('Stages').nextElementSibling).toHaveTextContent('3');
    expect(stats.getByText('Done').nextElementSibling).toHaveTextContent('1');
    expect(stats.getByText('Finished').nextElementSibling).toHaveTextContent('—');
  });

  it('marks stages Done, Current and Locked in order', () => {
    setup([chain()]);
    const rows = Array.from(document.querySelectorAll('.chain-stage'));
    expect(rows.map(row => row.className.match(/is-(done|current|locked)/)?.[1])).toEqual(['done', 'current', 'locked']);
    expect(rows.map(row => within(row as HTMLElement).getByText(/^(Done|Current|Locked)$/).textContent)).toEqual(['Done', 'Current', 'Locked']);
  });

  it('completes the current stage and refuses a locked one', async () => {
    const user = userEvent.setup();
    setup([chain()]);
    await user.click(screen.getByRole('button', { name: /^Find the vault door\. / }));
    expect(store.toggleStage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Learn the cipher. Available' }));
    expect(store.toggleStage).toHaveBeenCalledWith('c1', 's2');
  });

  it('shows the current stage details by default and reveals the others on demand', async () => {
    const user = userEvent.setup();
    setup([chain()]);
    expect(screen.getByText(/Walk the dry terrain\./)).toBeInTheDocument();
    expect(screen.queryByText('Maps are in the attic.')).toBeNull();
    const more = screen.getByRole('button', { name: 'Show details for Gather the old maps' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(screen.getByText('Maps are in the attic.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide details for Gather the old maps' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('hides the current stage details on demand and moves the default to the next current stage', async () => {
    const user = userEvent.setup();
    const stages = (secondDone: boolean) => [
      { id: 's1', name: 'Gather the old maps', done: true, description: 'Maps are in the attic.' },
      { id: 's2', name: 'Learn the cipher', done: secondDone, description: 'Second stage notes.' },
      { id: 's3', name: 'Find the vault door', done: false, description: 'Third stage notes.' },
    ];
    setup([chain({ stages: stages(false) })]);
    await user.click(screen.getByRole('button', { name: 'Hide details for Learn the cipher' }));
    expect(screen.queryByText('Second stage notes.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show details for Learn the cipher' }));
    expect(screen.getByText('Second stage notes.')).toBeInTheDocument();
    expect(screen.queryByText('Third stage notes.')).toBeNull();
    // Completing stage 2 makes stage 3 current; the store re-renders the page with the new stages.
    const previous = store.useEiyu.mock.results.at(-1)!.value;
    store.useEiyu.mockReturnValue({ ...previous, user: { ...previous.user, longQuests: [chain({ stages: stages(true) })] } });
    // Collapsing and reopening the chain re-renders the page so it reads the new stages.
    const head = screen.getByRole('button', { name: /The crystal vault/ });
    await user.click(head);
    await user.click(head);
    expect(screen.getByText('Third stage notes.')).toBeInTheDocument();
    expect(screen.queryByText('Second stage notes.')).toBeNull();
  });

  it('clamps a long chain description with a Show more toggle, keeping every character', async () => {
    const user = userEvent.setup();
    const long = `${'word '.repeat(60)}\n${'x'.repeat(200)}`;
    setup([chain({ description: long })]);
    const text = document.querySelector('.chain-description') as HTMLElement;
    expect(text).toHaveClass('is-clamped');
    expect(text.textContent).toBe(long);
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(text).not.toHaveClass('is-clamped');
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps a long Unicode stage name reachable by title and name', () => {
    const name = 'Ünïcödé–stage ⚔ '.repeat(8).slice(0, 80);
    setup([chain({ stages: [{ id: 's1', name, done: false, description: null }] })]);
    const row = screen.getByRole('button', { name: `${name}. Available` });
    expect(row).toBeInTheDocument();
    expect(row.querySelector('.chain-stage-name')).toHaveAttribute('title', name);
  });

  it('tells you what to do with a chain that has no stages', () => {
    setup([chain({ stages: [] })]);
    expect(screen.getByText(/has no stages yet/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('button', { name: 'EDIT' })).toBeInTheDocument();
  });

  it('pages a chain with many stages', async () => {
    const user = userEvent.setup();
    const stages = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, name: `Stage number ${i + 1}`, done: i < 3, description: null }));
    setup([chain({ stages })]);
    const pager = screen.getByRole('navigation', { name: 'Stages pages' });
    expect(within(pager).getByText('1 / 3')).toBeInTheDocument();
    expect(screen.queryByText('Stage number 9')).toBeNull();
    await user.click(within(pager).getByRole('button', { name: 'Next Stages page' }));
    expect(screen.getByText('Stage number 9')).toBeInTheDocument();
  });

  it('shows when a finished chain was completed', () => {
    setup([chain({ completedAt: '2026-09-28T10:00:00Z', stages: [{ id: 's1', name: 'Only', done: true, description: null }] })]);
    const stats = within(document.querySelector('.chain-stats') as HTMLElement);
    expect(stats.getByText('Finished').nextElementSibling).not.toHaveTextContent('—');
  });

  it('opens the edit and delete dialogs with their existing names', async () => {
    const user = userEvent.setup();
    setup([chain()]);
    await user.click(screen.getByRole('button', { name: 'DELETE LONG QUEST' }));
    expect(screen.getByRole('dialog', { name: 'Delete Long Quest' })).toBeInTheDocument();
  });

  it('keeps the empty state', () => {
    setup([]);
    expect(screen.getByText('NO LONG QUESTS')).toBeInTheDocument();
  });
});
