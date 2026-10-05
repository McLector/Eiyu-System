// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { formatDisplayDate, initialUser, type LongQuest } from '@eiyu/shared';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn(), toggleStage: vi.fn(), removeLongQuest: vi.fn(), saveLongQuest: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebLongQuests from '../WebLongQuests';
import { NavigationGuard } from '../../components/NavigationGuard';

afterEach(cleanup);

const CREATED = '2026-09-12T08:30:00Z';
const chain = (over: Partial<LongQuest> = {}): LongQuest => ({
  id: 'c1', name: 'The crystal vault', stat: 'INT', description: 'Recover the lost archive.', completedAt: null, createdAt: CREATED,
  stages: [
    { id: 's1', name: 'Gather the old maps', done: true, description: 'Maps are in the attic.' },
    { id: 's2', name: 'Learn the cipher', done: false, description: 'Walk the dry terrain.\nBring water.' },
    { id: 's3', name: 'Find the vault door', done: false, description: null },
  ],
  ...over,
});
const second = (): LongQuest => ({
  id: 'c2', name: 'Learn Rust', stat: 'INT', description: null, completedAt: null, createdAt: '2026-09-20T08:30:00Z',
  stages: [{ id: 'r1', name: 'Read the book', done: false, description: null }, { id: 'r2', name: 'Build a CLI', done: false, description: null }],
});

function mockStore(chains: LongQuest[], pendingStageIds: string[] = []) {
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', longQuests: chains }, stageRewardNotice: null, rewardReceipt: null,
    longQuestsLoading: false, longQuestsError: null, retryLongQuests: vi.fn(), toggleStage: store.toggleStage,
    removeLongQuest: store.removeLongQuest, saveLongQuest: store.saveLongQuest, pendingStageIds,
  });
}

// Re-renders the page without touching its own state, the way a store update does.
function Harness() {
  const [, bump] = useState(0);
  return <><button onClick={() => bump(n => n + 1)}>refresh</button><WebLongQuests /></>;
}

function setup(chains: LongQuest[], pendingStageIds: string[] = []) {
  store.toggleStage.mockReset();
  mockStore(chains, pendingStageIds);
  const router = createMemoryRouter([{ path: '/', element: <NavigationGuard><Harness /></NavigationGuard> }]);
  render(<RouterProvider router={router} />);
}

const nav = () => screen.getByRole('navigation', { name: 'Your chains' });
const panel = () => document.querySelector('.chain-panel') as HTMLElement;
const stageRows = () => Array.from(document.querySelectorAll<HTMLElement>('.chain-stage'));
const openMenu = async (user: ReturnType<typeof userEvent.setup>, stageName: string) => {
  await user.click(within(panel()).getByRole('button', { name: `Actions for ${stageName}` }));
  return within(screen.getByRole('menu')).getAllByRole('menuitem').map(item => item.textContent);
};

describe('Chain Progression', () => {
  beforeEach(() => { Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true, writable: true }); });

  it('is titled Chain Progression and has no animated map', () => {
    setup([chain()]);
    expect(screen.getByRole('heading', { name: 'CHAIN PROGRESSION' })).toBeInTheDocument();
    expect(document.querySelector('.journey')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });

  describe('chain list on the right', () => {
    it('opens the first chain and lists every chain with its done / total count', () => {
      setup([chain(), second()]);
      expect(within(panel()).getByRole('heading', { name: 'The crystal vault' })).toBeInTheDocument();
      const items = within(nav()).getAllByRole('button').filter(button => button.classList.contains('chain-nav-item'));
      expect(items.map(item => item.textContent)).toEqual(['The crystal vault1/3', 'Learn Rust0/2']);
      expect(items[0]).toHaveAttribute('aria-current', 'true');
      expect(items[1]).not.toHaveAttribute('aria-current');
    });

    it('switches the panel to the chain you pick, without leaving the page', async () => {
      const user = userEvent.setup();
      setup([chain(), second()]);
      await user.click(within(nav()).getByRole('button', { name: /Learn Rust/ }));
      expect(within(panel()).getByRole('heading', { name: 'Learn Rust' })).toBeInTheDocument();
      expect(within(panel()).getByText('Read the book')).toBeInTheDocument();
      expect(within(panel()).queryByText('Gather the old maps')).toBeNull();
      expect(within(nav()).getByRole('button', { name: /Learn Rust/ })).toHaveAttribute('aria-current', 'true');
      expect(within(nav()).getByRole('button', { name: /The crystal vault/ })).not.toHaveAttribute('aria-current');
    });

    it('falls back to the first chain when the chosen one is deleted', async () => {
      const user = userEvent.setup();
      setup([chain(), second()]);
      await user.click(within(nav()).getByRole('button', { name: /Learn Rust/ }));
      mockStore([chain()]);
      await user.click(screen.getByRole('button', { name: 'refresh' }));
      expect(within(panel()).getByRole('heading', { name: 'The crystal vault' })).toBeInTheDocument();
      expect(within(nav()).getByRole('button', { name: /The crystal vault/ })).toHaveAttribute('aria-current', 'true');
    });

    it('opens the new chain editor from + NEW CHAIN', async () => {
      const user = userEvent.setup();
      setup([chain()]);
      await user.click(within(nav()).getByRole('button', { name: /NEW CHAIN/ }));
      expect(screen.getByRole('dialog', { name: 'New Long Quest' })).toBeInTheDocument();
    });

    it('pages a long list of chains', async () => {
      const user = userEvent.setup();
      const many = Array.from({ length: 9 }, (_, i) => ({ ...second(), id: `m${i}`, name: `Chain number ${i + 1}` }));
      setup(many);
      const pager = within(nav()).getByRole('navigation', { name: 'Chains pages' });
      expect(within(nav()).queryByText('Chain number 9')).toBeNull();
      await user.click(within(pager).getByRole('button', { name: 'Next Chains page' }));
      expect(within(nav()).getByText('Chain number 9')).toBeInTheDocument();
    });
  });

  describe('the selected chain', () => {
    it('shows stages, done, created and finished with a labelled progress bar', () => {
      setup([chain()]);
      const stats = within(document.querySelector('.chain-stats') as HTMLElement);
      expect(stats.getByText('Stages').nextElementSibling).toHaveTextContent('3');
      expect(stats.getByText('Done').nextElementSibling).toHaveTextContent('1');
      expect(stats.getByText('Created').nextElementSibling).toHaveTextContent(formatDisplayDate(new Date(CREATED), 'UTC'));
      expect(stats.getByText('Finished').nextElementSibling).toHaveTextContent('—');
      expect(within(panel()).getByText('33%')).toBeInTheDocument();
      const bar = screen.getByRole('progressbar', { name: 'The crystal vault progress' });
      expect(bar).toHaveAttribute('aria-valuenow', '33');
      // The fill scales instead of animating width, so the change runs on the compositor.
      expect((bar.firstElementChild as HTMLElement).style.transform).toBe('scaleX(0.33)');
    });

    it('shows a dash instead of a date when the chain has no creation date', () => {
      setup([chain({ createdAt: undefined })]);
      const stats = within(document.querySelector('.chain-stats') as HTMLElement);
      expect(stats.getByText('Created').nextElementSibling).toHaveTextContent('—');
    });

    it('shows when a finished chain was completed', () => {
      setup([chain({ completedAt: '2026-09-28T10:00:00Z', stages: [{ id: 's1', name: 'Only', done: true, description: null }] })]);
      const stats = within(document.querySelector('.chain-stats') as HTMLElement);
      expect(stats.getByText('Finished').nextElementSibling).not.toHaveTextContent('—');
    });

    it('clamps a long description with a Show more toggle, keeping every character', async () => {
      const user = userEvent.setup();
      const long = `${'word '.repeat(60)}\n${'x'.repeat(200)}`;
      setup([chain({ description: long })]);
      const text = document.querySelector('.chain-panel .chain-description') as HTMLElement;
      expect(text).toHaveClass('is-clamped');
      expect(text.textContent).toBe(long);
      await user.click(screen.getByRole('button', { name: 'Show more' }));
      expect(text).not.toHaveClass('is-clamped');
      expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
    });

    it('tells you what to do with a chain that has no stages', () => {
      setup([chain({ stages: [] })]);
      expect(screen.getByText(/has no stages yet/)).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
      expect(screen.getByRole('button', { name: 'EDIT' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'COMPLETE STAGE' })).toBeNull();
    });

    it('opens the delete dialog with its existing name', async () => {
      const user = userEvent.setup();
      setup([chain()]);
      await user.click(screen.getByRole('button', { name: 'DELETE LONG QUEST' }));
      expect(screen.getByRole('dialog', { name: 'Delete Long Quest' })).toBeInTheDocument();
    });
  });

  describe('stages', () => {
    it('marks stages Done, Current and Locked in order', () => {
      setup([chain()]);
      expect(stageRows().map(row => row.className.match(/is-(done|current|locked)/)?.[1])).toEqual(['done', 'current', 'locked']);
      expect(stageRows().map(row => within(row).getByText(/^(Done|Current|Locked)$/).textContent)).toEqual(['Done', 'Current', 'Locked']);
    });

    it('offers COMPLETE STAGE on the current stage only, and completes it', async () => {
      const user = userEvent.setup();
      setup([chain()]);
      const buttons = screen.getAllByRole('button', { name: 'COMPLETE STAGE' });
      expect(buttons).toHaveLength(1);
      expect(stageRows()[1].contains(buttons[0])).toBe(true);
      await user.click(buttons[0]);
      expect(store.toggleStage).toHaveBeenCalledExactlyOnceWith('c1', 's2');
    });

    it('no longer turns a stage row into a button: clicking a row changes nothing', async () => {
      const user = userEvent.setup();
      setup([chain()]);
      for (const name of ['Gather the old maps', 'Learn the cipher', 'Find the vault door']) {
        expect(screen.queryByRole('button', { name: new RegExp(`^${name}\\.`) })).toBeNull();
        await user.click(screen.getByText(name));
      }
      expect(store.toggleStage).not.toHaveBeenCalled();
    });

    it('says why a locked stage is locked without making it actionable', () => {
      setup([chain()]);
      const locked = stageRows()[2];
      expect(within(locked).getByText(/Complete earlier stages first/)).toBeInTheDocument();
      expect(within(locked).queryByRole('button')).toBeNull();
    });

    it('disables COMPLETE STAGE while that stage is saving', () => {
      setup([chain()], ['s2']);
      expect(screen.getByRole('button', { name: 'COMPLETE STAGE' })).toBeDisabled();
    });

    it('shows no COMPLETE STAGE on a finished chain', () => {
      setup([chain({ completedAt: '2026-09-28T10:00:00Z', stages: [{ id: 's1', name: 'Only', done: true, description: null }] })]);
      expect(screen.queryByRole('button', { name: 'COMPLETE STAGE' })).toBeNull();
      expect(stageRows().map(row => row.className.match(/is-(done|current|locked)/)?.[1])).toEqual(['done']);
    });

    it('lets you undo only the last finished stage, from its menu', async () => {
      const user = userEvent.setup();
      setup([chain()]);
      expect(await openMenu(user, 'Gather the old maps')).toContain('Mark not done');
      await user.click(screen.getByRole('menuitem', { name: 'Mark not done' }));
      expect(store.toggleStage).toHaveBeenCalledExactlyOnceWith('c1', 's1');
    });

    it('refuses to undo an earlier stage while a later one is finished', async () => {
      const user = userEvent.setup();
      setup([chain({ stages: [
        { id: 's1', name: 'First', done: true, description: 'Has notes.' },
        { id: 's2', name: 'Second', done: true, description: null },
        { id: 's3', name: 'Third', done: false, description: null },
      ] })]);
      // The earlier stage has a menu for its details, but no way to undo it.
      expect(await openMenu(user, 'First')).toEqual(['Show details']);
      await user.keyboard('{Escape}');
      expect(within(stageRows()[1]).getByRole('button', { name: 'Actions for Second' })).toBeInTheDocument();
      expect(await openMenu(user, 'Second')).toEqual(['Mark not done']);
    });

    it('does not undo a stage that is saving', async () => {
      const user = userEvent.setup();
      setup([chain()], ['s1']);
      await user.click(within(panel()).getByRole('button', { name: 'Actions for Gather the old maps' }));
      expect(screen.getByRole('menuitem', { name: 'Mark not done' })).toBeDisabled();
    });

    it('shows the current stage details by default and reveals the others from their menu', async () => {
      const user = userEvent.setup();
      setup([chain()]);
      expect(screen.getByText(/Walk the dry terrain\./)).toBeInTheDocument();
      expect(screen.queryByText('Maps are in the attic.')).toBeNull();
      await openMenu(user, 'Gather the old maps');
      await user.click(screen.getByRole('menuitem', { name: 'Show details' }));
      expect(screen.getByText('Maps are in the attic.')).toBeInTheDocument();
      expect(await openMenu(user, 'Gather the old maps')).toContain('Hide details');
    });

    it('hides the current stage details on demand and moves the default to the next current stage', async () => {
      const user = userEvent.setup();
      const stages = (secondDone: boolean) => [
        { id: 's1', name: 'Gather the old maps', done: true, description: 'Maps are in the attic.' },
        { id: 's2', name: 'Learn the cipher', done: secondDone, description: 'Second stage notes.' },
        { id: 's3', name: 'Find the vault door', done: false, description: 'Third stage notes.' },
      ];
      setup([chain({ stages: stages(false) })]);
      await openMenu(user, 'Learn the cipher');
      await user.click(screen.getByRole('menuitem', { name: 'Hide details' }));
      expect(screen.queryByText('Second stage notes.')).toBeNull();
      // Hiding the details never hides the action.
      expect(screen.getByRole('button', { name: 'COMPLETE STAGE' })).toBeInTheDocument();
      await openMenu(user, 'Learn the cipher');
      await user.click(screen.getByRole('menuitem', { name: 'Show details' }));
      expect(screen.getByText('Second stage notes.')).toBeInTheDocument();
      expect(screen.queryByText('Third stage notes.')).toBeNull();
      // Completing stage 2 makes stage 3 current; the store re-renders the page with the new stages.
      mockStore([chain({ stages: stages(true) })]);
      await user.click(screen.getByRole('button', { name: 'refresh' }));
      expect(screen.getByText('Third stage notes.')).toBeInTheDocument();
      expect(screen.queryByText('Second stage notes.')).toBeNull();
    });

    it('keeps a long Unicode stage name reachable by title', () => {
      const name = 'Ünïcödé–stage ⚔ '.repeat(8).slice(0, 80);
      setup([chain({ stages: [{ id: 's1', name, done: false, description: null }] })]);
      expect(document.querySelector('.chain-stage-name')).toHaveAttribute('title', name);
    });

    it('pages a chain with many stages', async () => {
      const user = userEvent.setup();
      const stages = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, name: `Stage number ${i + 1}`, done: i < 3, description: null }));
      setup([chain({ stages })]);
      const pager = within(panel()).getByRole('navigation', { name: 'Stages pages' });
      expect(within(pager).getByText('1 / 3')).toBeInTheDocument();
      expect(screen.queryByText('Stage number 9')).toBeNull();
      await user.click(within(pager).getByRole('button', { name: 'Next Stages page' }));
      expect(screen.getByText('Stage number 9')).toBeInTheDocument();
    });
  });

  it('keeps the empty state, with no chain list to pick from', () => {
    setup([]);
    expect(screen.getByText('NO LONG QUESTS')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Your chains' })).toBeNull();
    expect(screen.getByRole('button', { name: /NEW QUEST/ })).toBeInTheDocument();
  });
});
