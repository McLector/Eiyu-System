import { render, screen } from '@testing-library/react-native';
import HabitHeatmap from '../eiyu/habit-heatmap';

let mockTimeZone = 'UTC';
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

describe('HabitHeatmap loading and empty states', () => {
  beforeEach(() => {
    mockTimeZone = 'UTC';
    mockFetchHistoryRange.mockReset().mockResolvedValue({});
  });

  it('keeps a loading message and today available while history is pending', async () => {
    mockFetchHistoryRange.mockReturnValue(new Promise(() => {}));
    await render(<HabitHeatmap userId="user-1" />);
    expect(mockFetchHistoryRange).toHaveBeenCalled();
    expect(screen.getByText('Loading…')).toBeOnTheScreen();
    const { accountDateKey } = jest.requireActual('@eiyu/shared') as typeof import('@eiyu/shared');
    expect(screen.getByRole('button', { name: `Today, ${accountDateKey(new Date(), mockTimeZone)}` })).toBeOnTheScreen();
  });

  it('keeps an empty-history prompt after a successful empty response', async () => {
    await render(<HabitHeatmap userId="user-1" />);
    expect(await screen.findByText('Tap a day to see details.')).toBeOnTheScreen();
  });
});
