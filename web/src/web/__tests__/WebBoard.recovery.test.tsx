// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type Quest, type UserProfile } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  completeRecovery: vi.fn(),
  toggleQuest: vi.fn(),
  useEiyu: vi.fn(),
}));

vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebBoard from '../WebBoard';

afterEach(cleanup);

describe('WebBoard recovery state', () => {
  beforeEach(() => {
    store.completeRecovery.mockReset();
    store.toggleQuest.mockReset();
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
      toggleQuest: store.toggleQuest,
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
    await user.click(screen.getByRole('button', { name: '1 recovery required' }));
    expect(document.body).toHaveTextContent('Streak frozen');
    expect(document.querySelector('.board-recovery-card .frost-mark')).not.toBeNull();
    expect(document.body).toHaveTextContent('Penalty: Walk for one minute');
    const recover = screen.getByRole('button', { name: 'MARK RECOVERY COMPLETE' });
    await user.click(recover);
    expect(store.completeRecovery).toHaveBeenCalledWith('habit-1');
  });

  it('separates daily habits, one-time items, and the complete habit catalog', async () => {
    const interaction = userEvent.setup();
    const habit = {
      id: 'daily', name: 'Daily habit', stat: 'STR' as const, difficulty: 'Medium' as const,
      easyVersion: 'One minute', description: null, questType: 'habit' as const,
      archived: false, time: '08:00', days: [1, 3, 5], streak: 0, frozen: false,
      completed: false, targetCount: null, progressCount: 0,
    };
    const quests: Quest[] = [
      { ...habit, dailyEligible: true },
      { ...habit, id: 'off-day', name: 'Off-day habit', dailyEligible: false },
      { ...habit, id: 'archived', name: 'Archived habit', dailyEligible: false, archived: true },
      {
        ...habit, id: 'one-time', name: 'One-time item', questType: 'one_time',
        easyVersion: null, dailyEligible: false,
      },
    ];
    store.useEiyu.mockReturnValue({
      user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests, longQuests: [] },
      questsLoading: false,
      questsError: null,
      retryQuests: vi.fn(),
      toggleQuest: store.toggleQuest,
      adjustProgress: vi.fn(),
      completeRecovery: store.completeRecovery,
    });

    const { container } = render(
      <WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />
    );
    expect(container).toHaveTextContent('0 / 2 quests');
    expect(container).toHaveTextContent('Daily Quest');
    expect(container).toHaveTextContent('1-Time Quest');
    expect(container).toHaveTextContent('Backlog');
    expect(screen.getByRole('button', { name: 'Complete Daily habit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete Off-day habit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete Archived habit' })).not.toBeInTheDocument();

    await interaction.click(screen.getByRole('button', { name: 'Complete One-time item' }));
    expect(store.toggleQuest).toHaveBeenCalledWith('one-time');

    // The complete habit catalog now opens as a dialog from the Daily lane.
    await interaction.click(screen.getByRole('button', { name: /ALL HABITS/ }));
    const catalog = screen.getByRole('dialog', { name: 'All habits' });
    expect(within(catalog).getByRole('button', { name: 'View Off-day habit details' })).toBeInTheDocument();
    expect(within(catalog).queryByText('Archived habit')).not.toBeInTheDocument();
    expect(within(catalog).queryByText('One-time item')).not.toBeInTheDocument();
    expect(store.toggleQuest).toHaveBeenCalledWith('one-time');
    expect(store.completeRecovery).not.toHaveBeenCalled();
  });

  it('distinguishes loading, offline error, and empty catalog states', async () => {
    store.useEiyu.mockReturnValue({
      user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests: [], longQuests: [] },
      questsLoading: true,
      questsError: null,
      retryQuests: vi.fn(),
      toggleQuest: store.toggleQuest,
      adjustProgress: vi.fn(),
      completeRecovery: store.completeRecovery,
    });
    const { rerender } = render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
    expect(screen.getByText('Reading the board…')).toBeInTheDocument();

    const retryQuests = vi.fn();
    store.useEiyu.mockReturnValue({
      user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests: [], longQuests: [] },
      questsLoading: false,
      questsError: 'You are offline',
      retryQuests,
      toggleQuest: store.toggleQuest,
      adjustProgress: vi.fn(),
      completeRecovery: store.completeRecovery,
    });
    rerender(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
    expect(screen.getByText('You are offline')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'RETRY' }));
    expect(retryQuests).toHaveBeenCalledOnce();

    store.useEiyu.mockReturnValue({
      user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests: [], longQuests: [] },
      questsLoading: false,
      questsError: null,
      retryQuests,
      toggleQuest: store.toggleQuest,
      adjustProgress: vi.fn(),
      completeRecovery: store.completeRecovery,
    });
    rerender(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
    expect(screen.getByText(/No habits are scheduled for today/)).toBeInTheDocument();
    expect(screen.getByText(/No 1-time quests scheduled for today\./)).toBeInTheDocument();
    expect(screen.getByText(/Nothing parked yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /ALL HABITS/ }));
    expect(within(screen.getByRole('dialog', { name: 'All habits' })).getByText(/No saved habits yet/)).toBeInTheDocument();
  });

  it('renders the named lanes and keeps archived definitions out of the habit catalog', async () => {
    const interaction = userEvent.setup();
    const habit = {
      id: 'daily', name: 'Daily habit', stat: 'STR' as const, difficulty: 'Medium' as const,
      easyVersion: 'One minute', description: null, questType: 'habit' as const,
      archived: false, time: '08:00', days: [1, 3, 5], streak: 0, frozen: false,
      completed: false, targetCount: null, progressCount: 0,
    };
    const quests: Quest[] = [
      { ...habit, dailyEligible: true },
      { ...habit, id: 'off-day', name: 'Off-day habit', dailyEligible: false },
      { ...habit, id: 'archived', name: 'Archived habit', archived: true, dailyEligible: false },
      { ...habit, id: 'archived-one-time', name: 'Archived one-time', archived: true, questType: 'one_time', easyVersion: null, days: [], dailyEligible: false },
    ];
    store.useEiyu.mockReturnValue({
      user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests, longQuests: [] },
      questsLoading: false,
      questsError: null,
      retryQuests: vi.fn(),
      toggleQuest: store.toggleQuest,
      adjustProgress: vi.fn(),
      completeRecovery: store.completeRecovery,
    });

    render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);

    const dailyLane = screen.getByRole('region', { name: 'Daily Quest' });
    const oneTimeLane = screen.getByRole('region', { name: '1-Time Quest' });
    expect(screen.getByRole('region', { name: 'Backlog' })).toBeInTheDocument();
    expect(within(dailyLane).getByText('Daily habit')).toBeInTheDocument();
    expect(within(oneTimeLane).getByText(/No 1-time quests scheduled for today\./)).toBeInTheDocument();
    await interaction.click(within(dailyLane).getByRole('button', { name: /ALL HABITS/ }));
    const catalog = screen.getByRole('dialog', { name: 'All habits' });
    expect(within(catalog).getByText('Off-day habit')).toBeInTheDocument();
    expect(within(catalog).queryByText('Archived habit')).not.toBeInTheDocument();
    expect(within(catalog).queryByText('Archived one-time')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Archived' })).not.toBeInTheDocument();
  });
});
