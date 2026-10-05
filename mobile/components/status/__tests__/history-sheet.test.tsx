import { act, screen, userEvent } from '@testing-library/react-native';
import { accountDateKey, EASY_XP, FULL_XP, historyDayKey, MONTH_NAMES, shiftHistoryMonth, type HistoryByDate } from '@eiyu/shared';

import { renderWithTheme } from '../../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockFetchMonthHistory = jest.fn();
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  fetchMonthHistory: (...args: unknown[]) => mockFetchMonthHistory(...args),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import { HistorySheet } from '../history-sheet';

const TZ = 'UTC';
const today = accountDateKey(new Date(), TZ);
const [todayYear, todayMonth0] = today.split('-').map(Number).map((n, i) => (i === 1 ? n - 1 : n)) as [number, number];
const day = (completions: { habitName: string; kind: 'full' | 'easy' }[]) => ({ completions, completedCount: completions.length, scheduledCount: completions.length });

function mount(over: Partial<React.ComponentProps<typeof HistorySheet>> = {}) {
  const props = { visible: true, userId: 'user-1', timeZone: TZ, onClose: jest.fn(), ...over };
  return renderWithTheme(<HistorySheet {...props} />).then(() => props);
}

describe('HistorySheet', () => {
  beforeEach(() => {
    mockFetchMonthHistory.mockReset().mockResolvedValue({} as HistoryByDate);
  });

  it('opens on the current account month and reads that month', async () => {
    await mount();
    expect(screen.getByText(`${MONTH_NAMES[todayMonth0].toUpperCase()} ${todayYear}`)).toBeOnTheScreen();
    expect(mockFetchMonthHistory).toHaveBeenCalledWith('user-1', todayYear, todayMonth0);
  });

  it('shows nothing and reads nothing while closed', async () => {
    await mount({ visible: false });
    expect(screen.queryByText('HISTORY')).toBeNull();
    expect(mockFetchMonthHistory).not.toHaveBeenCalled();
  });

  it('steps to the previous and next months and reads each', async () => {
    const user = userEvent.setup();
    await mount();
    const prev = shiftHistoryMonth({ year: todayYear, month: todayMonth0 }, -1);
    await user.press(screen.getByTestId('history-prev-month'));
    expect(mockFetchMonthHistory).toHaveBeenLastCalledWith('user-1', prev.year, prev.month);
    expect(screen.getByText(`${MONTH_NAMES[prev.month].toUpperCase()} ${prev.year}`)).toBeOnTheScreen();
    await user.press(screen.getByTestId('history-next-month'));
    await user.press(screen.getByTestId('history-next-month'));
    const next = shiftHistoryMonth({ year: todayYear, month: todayMonth0 }, 1);
    expect(mockFetchMonthHistory).toHaveBeenLastCalledWith('user-1', next.year, next.month);
  });

  it('keeps month buttons named and at least 48dp', async () => {
    await mount();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeOnTheScreen();
  });

  it('marks each day as a full completion, a penalty, or nothing, for screen readers too', async () => {
    mockFetchMonthHistory.mockResolvedValue({
      [historyDayKey(todayYear, todayMonth0, 1)]: day([{ habitName: 'Read', kind: 'full' }]),
      [historyDayKey(todayYear, todayMonth0, 2)]: day([{ habitName: 'Run', kind: 'easy' }]),
    });
    await mount();
    expect(await screen.findByLabelText(`${historyDayKey(todayYear, todayMonth0, 1)}: full completion`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`${historyDayKey(todayYear, todayMonth0, 2)}: penalty`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`${historyDayKey(todayYear, todayMonth0, 3)}: no completion`)).toBeOnTheScreen();
  });

  it("lists today's completions with their XP, and says so when there are none", async () => {
    mockFetchMonthHistory.mockResolvedValue({ [today]: day([{ habitName: 'Read', kind: 'full' }, { habitName: 'Run', kind: 'easy' }]) });
    await mount();
    expect(await screen.findByText('Read')).toBeOnTheScreen();
    expect(screen.getByText(`+${FULL_XP} XP`)).toBeOnTheScreen();
    expect(screen.getByText(`+${EASY_XP} XP`)).toBeOnTheScreen();
  });

  it('says nothing was completed on a quiet day', async () => {
    await mount();
    expect(await screen.findByText('Nothing completed this day.')).toBeOnTheScreen();
  });

  it('lists another day when it is pressed', async () => {
    mockFetchMonthHistory.mockResolvedValue({ [historyDayKey(todayYear, todayMonth0, 1)]: day([{ habitName: 'Old habit', kind: 'full' }]) });
    const user = userEvent.setup();
    await mount();
    await user.press(await screen.findByLabelText(`${historyDayKey(todayYear, todayMonth0, 1)}: full completion`));
    expect(await screen.findByText('Old habit')).toBeOnTheScreen();
  });

  it('shows a loading state, then the calendar', async () => {
    let release!: (value: HistoryByDate) => void;
    mockFetchMonthHistory.mockReturnValue(new Promise<HistoryByDate>(resolve => { release = resolve; }));
    await mount();
    expect(screen.getByRole('progressbar')).toBeOnTheScreen();
    await act(async () => { release({}); });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('reports a failed read as an alert and retries it', async () => {
    mockFetchMonthHistory.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    await mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t pull this month/i);
    await user.press(screen.getByRole('button', { name: 'RETRY' }));
    expect(mockFetchMonthHistory).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not let a slow read for one month overwrite the month now showing', async () => {
    let releaseFirst!: (value: HistoryByDate) => void;
    mockFetchMonthHistory
      .mockReturnValueOnce(new Promise<HistoryByDate>(resolve => { releaseFirst = resolve; }))
      .mockResolvedValue({});
    const user = userEvent.setup();
    await mount();
    await user.press(screen.getByTestId('history-prev-month'));
    await act(async () => { releaseFirst({ [today]: day([{ habitName: 'Stale', kind: 'full' }]) }); });
    expect(screen.queryByText('Stale')).toBeNull();
  });

  it('closes from its Close button', async () => {
    const user = userEvent.setup();
    const p = await mount();
    await user.press(screen.getByRole('button', { name: 'Close History' }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});
