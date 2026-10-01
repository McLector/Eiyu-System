import { cleanup, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { initialUser } from '@eiyu/shared';

const mockFetchOrCreateWeeklySummary = jest.fn();
const mockFetchWeeklyReview = jest.fn();
jest.doMock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  fetchOrCreateWeeklySummary: mockFetchOrCreateWeeklySummary,
  fetchWeeklyReview: mockFetchWeeklyReview,
}));
const { default: StatusScreen } = require('../../app/(tabs)/status') as typeof import('../../app/(tabs)/status');

let mockStoreValue: any;
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStoreValue }));
jest.mock('@/contexts/auth-store', () => ({ useAuth: () => ({ session: { user: { id: 'user-1' } } }) }));
jest.mock('@/components/eiyu/divider', () => ({ Divider: () => null }));
jest.mock('@/components/eiyu/glass-view', () => ({ GlassView: 'View' }));
jest.mock('@/components/eiyu/habit-heatmap', () => () => null);
jest.mock('@/components/eiyu/icons', () => ({ StatIcon: () => null }));
jest.mock('@/components/eiyu/page-background', () => ({ PageBackground: () => null }));
jest.mock('@/components/eiyu/radar-chart', () => ({ RadarChart: () => null }));
jest.mock('@/components/eiyu/screen', () => ({ Screen: ({ children }: { children: unknown }) => {
  const { View } = jest.requireActual('react-native');
  return <View>{children}</View>;
} }));
jest.mock('@/components/weekly-review-matrix', () => () => null);

const summary = 'You completed reading on four days and kept a steady evening routine.';

describe('Status weekly summary success and cache display', () => {
  beforeEach(() => {
    mockStoreValue = {
      user: { ...initialUser, rank: 'E', timeZone: 'UTC' },
      theme: { body: '#000', muted: '#aaa', display: '#fff', text: '#fff', accent: '#0ff', accentGlass: '#022', accentBorder: '#355', glassBorder: '#333', track: '#222' },
      darkMode: true,
      weeklyQuest: null,
    };
    mockFetchOrCreateWeeklySummary.mockReset().mockResolvedValue(summary);
    mockFetchWeeklyReview.mockReset().mockResolvedValue([]);
  });

  afterEach(() => { cleanup(); jest.restoreAllMocks(); });

  it('renders a non-empty generated paragraph and reuses it when returning to Weekly Review', async () => {
    const user = userEvent.setup();
    await render(<StatusScreen />);
    await waitFor(() => expect(mockFetchOrCreateWeeklySummary).toHaveBeenCalledWith('user-1', 'UTC'));
    await user.press(screen.getByText('WEEKLY REVIEW'));

    await waitFor(() => expect(screen.getByTestId('weekly-summary-content').props.children).toBe(summary));
    expect(screen.getByText(summary)).toBeOnTheScreen();
    expect(screen.queryByText('Thinking…')).toBeNull();

    await user.press(screen.getByText('STATS'));
    await user.press(screen.getByText('WEEKLY REVIEW'));
    expect(screen.getByTestId('weekly-summary-content')).toBeOnTheScreen();
    expect(mockFetchOrCreateWeeklySummary).toHaveBeenCalledTimes(1);
  });
});
