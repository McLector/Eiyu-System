// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { initialUser, type Quest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ toggleQuest: vi.fn(), useEiyu: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebBoard from '../WebBoard';

const quest = (id: string, name: string): Quest => ({
  id, name, stat: 'STR', difficulty: 'Medium', easyVersion: 'One minute', description: null,
  questType: 'habit', archived: false, time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0,
  frozen: false, dailyEligible: true, completed: false, targetCount: null, progressCount: 0,
});

beforeEach(() => {
  vi.useFakeTimers();
  store.toggleQuest.mockReset().mockResolvedValue(true);
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', rank: 'E', quests: [quest('a', 'Walk'), quest('b', 'Read')], longQuests: [] },
    questsLoading: false, questsError: null, retryQuests: vi.fn(),
    toggleQuest: store.toggleQuest, adjustProgress: vi.fn(), completeRecovery: vi.fn(),
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const complete = async (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: `Complete ${name}` }));
  await act(async () => { await Promise.resolve(); });
};
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('Board XP toast timing', () => {
  it('shows the toast and clears it after two seconds', async () => {
    render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
    await complete('Walk');
    expect(screen.getByText('+20 STR XP')).toBeInTheDocument();
    tick(2000);
    expect(screen.queryByText('+20 STR XP')).toBeNull();
  });

  it('keeps the second toast for its own full two seconds', async () => {
    render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
    await complete('Walk');
    tick(1500);
    await complete('Read');
    // The first completion's timer would fire here and wrongly hide the second toast.
    tick(600);
    expect(screen.getByText('+20 STR XP')).toBeInTheDocument();
    tick(1400);
    expect(screen.queryByText('+20 STR XP')).toBeNull();
  });

  it('does not touch state after the board unmounts', async () => {
    const view = render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
    await complete('Walk');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    view.unmount();
    tick(3000);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
