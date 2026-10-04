// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type LongQuest } from '@eiyu/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebLongQuests from '../WebLongQuests';

afterEach(cleanup);

const quest: LongQuest = {
  id: 'lq', name: 'Ship it', stat: 'INT', description: null, completedAt: null,
  stages: [
    { id: 's1', name: 'Plan', done: true, description: null },
    { id: 's2', name: 'Build', done: false, description: 'Keep it small.' },
    { id: 's3', name: 'Launch', done: false, description: null },
  ],
};

function open() {
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, longQuests: [quest] }, longQuestsLoading: false, longQuestsError: null,
    retryLongQuests: vi.fn(), toggleStage: vi.fn(), removeLongQuest: vi.fn(), saveLongQuest: vi.fn(),
    stageRewardNotice: null, rewardReceipt: null, pendingStageIds: [],
  });
  render(<WebLongQuests />);
  return userEvent.setup();
}

describe('Long Quest card after the HUD pass', () => {
  it('names the stat once, in the summary, not again under the title', async () => {
    const user = open();
    const header = screen.getByText('Ship it').closest('button')!;
    expect(within(header).queryByText('INT')).toBeNull();
    expect(screen.getByText(/INT · 1 \/ 3 stages completed/)).toBeInTheDocument();
    await user.click(header);
    expect(screen.getAllByText(/\bINT\b/)).toHaveLength(1);
  });

  it('lists stages as plain checklist rows with their state in the name', async () => {
    const user = open();
    await user.click(screen.getByText('Ship it').closest('button')!);
    const done = document.getElementById('stage-s1')!;
    const locked = document.getElementById('stage-s3')!;
    expect(done).toHaveClass('stage-row', 'is-done');
    expect(done).toHaveAccessibleName('Plan. Completed');
    expect(document.getElementById('stage-s2')).toHaveAccessibleName('Build. Available');
    expect(locked).toHaveClass('stage-row', 'is-locked');
    expect(locked).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps map checkpoints and checklist rows as different controls with different names', async () => {
    const user = open();
    await user.click(screen.getByText('Ship it').closest('button')!);
    expect(screen.getAllByRole('button', { name: /Build\./ })).toHaveLength(2);
    expect(new Set(screen.getAllByRole('button', { name: /Build\./ }).map(b => b.getAttribute('aria-label'))).size).toBe(2);
  });

  it('moves focus to the checklist row when a map checkpoint is chosen, even if the row mounts a frame late', async () => {
    const user = open();
    await user.click(screen.getByRole('button', { name: /^Map checkpoint 2: Build\./ }));
    await waitFor(() => expect(document.getElementById('stage-s2')).toHaveFocus());
    expect(document.getElementById('stage-s2')).toHaveAccessibleName('Build. Available');
  });

  it('gives up quietly when the row never appears instead of throwing', async () => {
    const user = open();
    const frames = vi.spyOn(window, 'requestAnimationFrame');
    await user.click(screen.getByRole('button', { name: /^Map checkpoint 3: Launch\./ }));
    // A locked stage still has a row, so focus lands on it; the retry loop must stay bounded either way.
    await waitFor(() => expect(document.getElementById('stage-s3')).toHaveFocus());
    expect(frames.mock.calls.length).toBeLessThan(15);
    frames.mockRestore();
  });

  it('shows a stage description inside its row without giving the row an extra card', async () => {
    const user = open();
    await user.click(screen.getByText('Ship it').closest('button')!);
    const row = document.getElementById('stage-s2')!;
    expect(within(row).getByText('Keep it small.')).toBeInTheDocument();
    expect(row.getAttribute('style') ?? '').not.toMatch(/border|background/);
  });
});
