import { act, cleanup, render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import HabitHeatmap from '../eiyu/habit-heatmap';

let mockTimeZone = 'Etc/GMT+12';
const mockFetchHistoryRange = jest.fn();
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => ({
  user: { timeZone: mockTimeZone },
  theme: { text: '#fff', dim: '#aaa', muted: '#bbb', accent: '#0ff', accentStrong: '#0ff', glassBorder: '#333' },
}) }));
jest.mock('../../../packages/shared/src/index.ts', () => ({
  ...jest.requireActual('../../../packages/shared/src/index.ts'),
  fetchHistoryRange: (...args: unknown[]) => mockFetchHistoryRange(...args),
}));
jest.mock('@/components/eiyu/glass-view', () => ({ GlassView: 'View' }));
jest.mock('@/components/eiyu/icons', () => ({ StarIcon: () => null }));

describe('HabitHeatmap', () => {
  let scrollToEnd: jest.SpyInstance;

  beforeEach(() => {
    mockTimeZone = 'Etc/GMT+12';
    mockFetchHistoryRange.mockReset().mockResolvedValue({});
    scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    scrollToEnd.mockRestore();
  });

  it('scrolls to the current account date after measuring content and stops auto-scrolling after user input', async () => {
    await render(<HabitHeatmap userId="user-1" />);
    const { accountDateKey, toDateKey } = jest.requireActual('@eiyu/shared') as typeof import('@eiyu/shared');
    const today = accountDateKey(new Date(), mockTimeZone);
    const previousMonthDay = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
    previousMonthDay.setUTCMonth(previousMonthDay.getUTCMonth() - 1);
    const previousMonthDayKey = toDateKey(previousMonthDay);
    expect(screen.getByRole('button', { name: `Today, ${today}` })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: `History for ${previousMonthDayKey}` })).toBeOnTheScreen();

    const scroller = screen.getByTestId('status-heatmap-scroll');
    expect(scrollToEnd).not.toHaveBeenCalled();
    act(() => scroller.props.onContentSizeChange(620, 112));
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
    act(() => scroller.props.onScrollBeginDrag({ nativeEvent: { contentOffset: { x: 0, y: 0 } } }));
    act(() => scroller.props.onContentSizeChange(700, 112));
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
  });

});
