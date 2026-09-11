// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type Quest, type UserProfile } from '@eiyu/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  completeRecovery: vi.fn(),
  useEiyu: vi.fn(),
}));

vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebBoard from '../WebBoard';

describe('WebBoard recovery state', () => {
  beforeEach(() => {
    store.completeRecovery.mockReset();
    const quest: Quest = {
      id: 'habit-1',
      name: 'Morning walk',
      stat: 'STR',
      difficulty: 'Medium',
      easyVersion: 'Walk for one minute',
      description: null,
      questType: 'habit',
      time: '08:00',
      days: [0, 1, 2, 3, 4, 5, 6],
      streak: 4,
      frozen: true,
      frozenDate: '2026-09-10',
      recoveryDeadline: '2026-09-12T00:00:00.000Z',
      recoveryTimeZone: 'UTC',
      dailyEligible: true,
      completed: true,
      targetCount: null,
      progressCount: 0,
    };
    const user: UserProfile = {
      ...initialUser,
      timeZone: 'UTC',
      rank: 'E',
      quests: [quest],
      longQuests: [],
    };
    store.useEiyu.mockReturnValue({
      user,
      questsLoading: false,
      questsError: null,
      retryQuests: vi.fn(),
      toggleQuest: vi.fn(),
      adjustProgress: vi.fn(),
      completeRecovery: store.completeRecovery,
    });
  });

  it('keeps recovery actionable after the same-day normal quest is complete', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />
    );

    expect(container).toHaveTextContent('1 / 1 quests');
    expect(container).toHaveTextContent('STREAK FROZEN — RECOVERY QUEST');
    const recover = screen.getByRole('button', { name: 'MARK RECOVERY COMPLETE' });
    await user.click(recover);
    expect(store.completeRecovery).toHaveBeenCalledWith('habit-1');
  });
});
