// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { initialUser, type RewardReceipt } from '@eiyu/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebLongQuests from '../WebLongQuests';

afterEach(cleanup);

const receipt: RewardReceipt = {
  id: 'reward', stage_id: 'stage', done: true, changed: true, replayed: false,
  components: [{ kind: 'stage', stat: 'INT', delta: 20 }],
  totals: [{ stat: 'INT', before: 0, after: 20, delta: 20 }],
};

function setup(overrides: Record<string, unknown>) {
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, longQuests: [] }, longQuestsLoading: false, longQuestsError: null,
    retryLongQuests: vi.fn(), toggleStage: vi.fn(), removeLongQuest: vi.fn(), saveLongQuest: vi.fn(),
    stageRewardNotice: null, rewardReceipt: null, ...overrides,
  });
}

describe('Long Quest completion announcements', () => {
  it('announces a stage completion exactly once when a reward card is shown', () => {
    setup({ stageRewardNotice: 'Stage completed.', rewardReceipt: receipt });
    render(<WebLongQuests />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status', { name: 'Confirmed XP reward' })).toBeInTheDocument();
  });

  it('still announces the notice when there is no reward card to carry it', () => {
    setup({ stageRewardNotice: 'Stage undone.', rewardReceipt: null });
    render(<WebLongQuests />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Stage undone.');
  });

  it('announces a replayed receipt through the notice because no card is shown', () => {
    setup({ stageRewardNotice: 'Stage confirmed.', rewardReceipt: { ...receipt, replayed: true } });
    render(<WebLongQuests />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Stage confirmed.');
  });
});
