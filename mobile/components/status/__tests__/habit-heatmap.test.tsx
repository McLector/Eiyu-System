import { act, screen, userEvent } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { accountDateKey, addUtcDays, toDateKey, type HistoryByDate } from '@eiyu/shared';

import { renderWithTheme } from '../../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockFocusEffect: (() => unknown) | null = null;
const mockFetchHistoryRange = jest.fn();
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => unknown) => { mockFocusEffect = callback; } }));
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  fetchHistoryRange: (...args: unknown[]) => mockFetchHistoryRange(...args),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import HabitHeatmap from '../habit-heatmap';

const TZ = 'UTC';
const today = accountDateKey(new Date(), TZ);
const yesterday = toDateKey(addUtcDays(new Date(`${today}T00:00:00.000Z`), -1));
const day = (names: string[], scheduled = names.length) => ({
  completions: names.map(habitName => ({ habitName, kind: 'full' as const })), completedCount: names.length, scheduledCount: scheduled,
});

function mount(timeZone = TZ) {
  return renderWithTheme(<HabitHeatmap userId="user-1" timeZone={timeZone} />);
}

describe('HabitHeatmap', () => {
  let scrollToEnd: jest.SpyInstance;

  beforeEach(() => {
    mockFocusEffect = null;
    mockFetchHistoryRange.mockReset().mockResolvedValue({} as HistoryByDate);
    scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => {});
  });
  afterEach(() => scrollToEnd.mockRestore());

  it('shows today and an earlier day, and scrolls to the latest month once measured, then stops once the user scrolls', async () => {
    await mount('Etc/GMT+12');
    const zoneToday = accountDateKey(new Date(), 'Etc/GMT+12');
    expect(screen.getByRole('button', { name: `Today, ${zoneToday}` })).toBeOnTheScreen();

    const scroller = screen.getByTestId('status-heatmap-scroll');
    expect(scrollToEnd).not.toHaveBeenCalled();
    await act(async () => { scroller.props.onContentSizeChange(620, 112); });
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
    await act(async () => { scroller.props.onScrollBeginDrag({ nativeEvent: { contentOffset: { x: 0, y: 0 } } }); });
    await act(async () => { scroller.props.onContentSizeChange(700, 112); });
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
  });

  it('keeps today available and says it is loading while history is pending', async () => {
    mockFetchHistoryRange.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(mockFetchHistoryRange).toHaveBeenCalled();
    expect(screen.getByText('Loading…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: `Today, ${today}` })).toBeOnTheScreen();
  });

  it('reads the window again when the tab regains focus', async () => {
    await mount();
    const calls = mockFetchHistoryRange.mock.calls.length;
    await act(async () => { mockFocusEffect?.(); });
    expect(mockFetchHistoryRange.mock.calls.length).toBeGreaterThan(calls);
  });

  it('opens a sheet for a pressed day with its completions and count', async () => {
    mockFetchHistoryRange.mockResolvedValue({ [yesterday]: day(['Read', 'Run'], 3) });
    const user = userEvent.setup();
    await mount();
    await user.press(await screen.findByRole('button', { name: `History for ${yesterday}` }));
    expect(await screen.findByText('2/3 completed')).toBeOnTheScreen();
    expect(screen.getByText('Read')).toBeOnTheScreen();
    expect(screen.getByText('Run')).toBeOnTheScreen();
  });

  it('says so when a pressed day has nothing completed', async () => {
    const user = userEvent.setup();
    await mount();
    await user.press(await screen.findByRole('button', { name: `History for ${yesterday}` }));
    expect(await screen.findByText('Nothing completed this day.')).toBeOnTheScreen();
  });

  it('calls today TODAY in its sheet', async () => {
    const user = userEvent.setup();
    await mount();
    await user.press(screen.getByRole('button', { name: `Today, ${today}` }));
    expect(await screen.findByText('TODAY')).toBeOnTheScreen();
  });

  it('does not open a sheet for a day that has not happened', async () => {
    const tomorrow = toDateKey(addUtcDays(new Date(`${today}T00:00:00.000Z`), 1));
    await mount();
    const future = screen.queryByRole('button', { name: `History for ${tomorrow}` });
    if (future) expect(future).toBeDisabled();
  });

  it('closes the sheet again', async () => {
    const user = userEvent.setup();
    await mount();
    await user.press(screen.getByRole('button', { name: `Today, ${today}` }));
    await user.press(await screen.findByRole('button', { name: 'Close day details' }));
    expect(screen.queryByText('Nothing completed this day.')).toBeNull();
  });

  it('reports a failed read as an alert and retries it', async () => {
    mockFetchHistoryRange.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    await mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load the heatmap/i);
    await user.press(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockFetchHistoryRange.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('does nothing without a signed-in user', async () => {
    await renderWithTheme(<HabitHeatmap userId={undefined} timeZone={TZ} />);
    expect(mockFetchHistoryRange).not.toHaveBeenCalled();
  });
});
