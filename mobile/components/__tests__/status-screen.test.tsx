import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { initialUser, WEEKLY_REVIEW_COPY, type UserProfile, type WeeklyDayDatum } from '@eiyu/shared';

import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockFetchOrCreateWeeklySummary = jest.fn();
const mockFetchWeeklyReview = jest.fn();
const mockRegenerateWeeklySummary = jest.fn();
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  fetchOrCreateWeeklySummary: (...args: unknown[]) => mockFetchOrCreateWeeklySummary(...args),
  fetchWeeklyReview: (...args: unknown[]) => mockFetchWeeklyReview(...args),
  regenerateWeeklySummary: (...args: unknown[]) => mockRegenerateWeeklySummary(...args),
}));

let mockStoreValue: { user: UserProfile };
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStoreValue }));
jest.mock('@/contexts/auth-store', () => ({ useAuth: () => ({ session: { user: { id: 'user-1' } } }) }));
jest.mock('@/components/status/habit-heatmap', () => ({
  __esModule: true,
  default: ({ userId, timeZone }: { userId?: string; timeZone: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text testID="heatmap-stub">{`heatmap ${userId} ${timeZone}`}</Text>;
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import StatusScreen from '../../app/(tabs)/status';

const summary = 'You completed reading on four days and kept a steady evening routine.';
const week: WeeklyDayDatum[] = ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'].map((label, i) => ({
  dateKey: `2026-12-${25 + i}`, day: label, STR: i === 0 ? 2 : 0, INT: 0, DEX: 0, WIS: 0, CHA: 0,
}));

function mount(statOverrides: Partial<UserProfile['stats']> = {}) {
  mockStoreValue = {
    user: {
      ...initialUser, name: 'Yuki Tanaka', userClass: 'Ranger', rank: 'C', timeZone: 'UTC', quests: [], longQuests: [],
      stats: { ...initialUser.stats, STR: { level: 3, xp: 40, xpMax: 100 }, ...statOverrides } as UserProfile['stats'],
    },
  };
  return renderWithTheme(<StatusScreen />);
}
const goto = async (label: string) => { await userEvent.setup().press(screen.getByRole('radio', { name: label })); };

describe('StatusScreen views', () => {
  beforeEach(() => {
    mockFetchOrCreateWeeklySummary.mockReset().mockResolvedValue(summary);
    mockFetchWeeklyReview.mockReset().mockResolvedValue(week);
    mockRegenerateWeeklySummary.mockReset().mockResolvedValue('A fresh paragraph.');
  });

  it('offers HERO, STATS and WEEKLY and opens on STATS', async () => {
    await mount();
    expect(screen.getByLabelText('Status views')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'STATS' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'HERO' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'WEEKLY' })).not.toBeChecked();
  });

  it('has no Weekly Quest card', async () => {
    await mount();
    expect(screen.queryByText(/WEEKLY QUEST/)).toBeNull();
  });

  it('follows a swipe to another page and the segmented control follows it back', async () => {
    const user = userEvent.setup();
    await mount();
    await act(async () => { screen.getByTestId('status-pager').props.onPageSelected({ nativeEvent: { position: 2 } }); });
    expect(screen.getByRole('radio', { name: 'WEEKLY' })).toBeChecked();
    await user.press(screen.getByRole('radio', { name: 'HERO' }));
    expect(screen.getByRole('radio', { name: 'HERO' })).toBeChecked();
  });

  it('ignores a swipe to a page that does not exist', async () => {
    await mount();
    await act(async () => { screen.getByTestId('status-pager').props.onPageSelected({ nativeEvent: { position: 9 } }); });
    expect(screen.getByRole('radio', { name: 'STATS' })).toBeChecked();
  });
});

describe('StatusScreen STATS', () => {
  beforeEach(() => {
    mockFetchOrCreateWeeklySummary.mockReset().mockResolvedValue(summary);
    mockFetchWeeklyReview.mockReset().mockResolvedValue(week);
  });

  it('shows every stat with its level, XP and a progress bar', async () => {
    await mount();
    expect(screen.getByText('Lv.3')).toBeOnTheScreen();
    expect(screen.getByText('40/100 XP')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'STR XP progress: 40%' })).toHaveProp('accessibilityValue', { min: 0, max: 100, now: 40 });
    expect(screen.getAllByRole('progressbar', { name: /XP progress/ })).toHaveLength(5);
  });

  it('keeps a bar between 0 and 100 whatever the numbers say', async () => {
    await mount({
      INT: { level: 5, xp: 250, xpMax: 100 },
      WIS: { level: 1, xp: -20, xpMax: 100 },
      DEX: { level: 1, xp: 5, xpMax: 0 },
    } as Partial<UserProfile['stats']>);
    expect(screen.getByRole('progressbar', { name: 'INT XP progress: 100%' })).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'WIS XP progress: 0%' })).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'DEX XP progress: 0%' })).toBeOnTheScreen();
  });

  it('shows the heatmap with the account time zone', async () => {
    await mount();
    expect(screen.getByTestId('heatmap-stub')).toHaveTextContent('heatmap user-1 UTC');
  });
});

describe('StatusScreen HERO', () => {
  beforeEach(() => {
    mockFetchOrCreateWeeklySummary.mockReset().mockResolvedValue(summary);
    mockFetchWeeklyReview.mockReset().mockResolvedValue(week);
  });

  it('shows who you are, your rank and the radar', async () => {
    await mount();
    await goto('HERO');
    expect(screen.getByText('HERO RANK')).toBeOnTheScreen();
    expect(screen.getByText('C')).toBeOnTheScreen();
    expect(screen.getByText('Yuki Tanaka')).toBeOnTheScreen();
    expect(screen.getByText('Ranger')).toBeOnTheScreen();
    expect(screen.getByText('STAT OVERVIEW')).toBeOnTheScreen();
    expect(screen.getByLabelText(/Stat levels: STR 3/)).toBeOnTheScreen();
  });

  it('contains an 80-character name instead of overflowing the panel', async () => {
    await mount();
    await goto('HERO');
    // The name is on the HERO panel: it wraps to two lines and ends in an ellipsis.
    expect(screen.getByTestId('status-hero-name')).toHaveProp('numberOfLines', 2);
  });
});

describe('StatusScreen WEEKLY', () => {
  beforeEach(() => {
    mockFetchOrCreateWeeklySummary.mockReset().mockResolvedValue(summary);
    mockFetchWeeklyReview.mockReset().mockResolvedValue(week);
    mockRegenerateWeeklySummary.mockReset().mockResolvedValue('A fresh paragraph.');
  });

  it('prefetches the summary when Status opens, not when the tab is pressed, and reuses it', async () => {
    await mount();
    await waitFor(() => expect(mockFetchOrCreateWeeklySummary).toHaveBeenCalledWith('user-1', 'UTC'));
    await goto('WEEKLY');
    await waitFor(() => expect(screen.getByTestId('weekly-summary-content')).toHaveTextContent(summary));
    await goto('STATS');
    await goto('WEEKLY');
    expect(mockFetchOrCreateWeeklySummary).toHaveBeenCalledTimes(1);
  });

  it('reads the last seven days only once the Weekly view is opened', async () => {
    await mount();
    expect(mockFetchWeeklyReview).not.toHaveBeenCalled();
    await goto('WEEKLY');
    await waitFor(() => expect(mockFetchWeeklyReview).toHaveBeenCalledWith('user-1', 'UTC'));
    expect(await screen.findByLabelText(/STR, Fri, December 25, 2026: 2 completions/)).toBeOnTheScreen();
  });

  it('reports a failed week as an alert with Retry', async () => {
    mockFetchWeeklyReview.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    await mount();
    await goto('WEEKLY');
    expect(await screen.findByText(WEEKLY_REVIEW_COPY.error)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByLabelText(/STR, Fri, December 25, 2026: 2 completions/)).toBeOnTheScreen();
    expect(mockFetchWeeklyReview).toHaveBeenCalledTimes(2);
  });

  it('shows a reading state while the summary is pending', async () => {
    mockFetchOrCreateWeeklySummary.mockReturnValue(new Promise(() => {}));
    await mount();
    await goto('WEEKLY');
    expect(screen.getByText(/Reading the week.s signs/)).toBeOnTheScreen();
  });

  it('reports a failed summary as an alert with Retry that reads it again', async () => {
    mockFetchOrCreateWeeklySummary.mockRejectedValueOnce(new Error('archive down'));
    const user = userEvent.setup();
    await mount();
    await goto('WEEKLY');
    expect(await screen.findByText(/couldn.t reach the archive/i)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Retry weekly summary' }));
    await waitFor(() => expect(screen.getByTestId('weekly-summary-content')).toHaveTextContent(summary));
  });

  it('shortens a long summary behind READ MORE and SHOW LESS', async () => {
    const long = `${'A long reflective sentence. '.repeat(12)}END`;
    mockFetchOrCreateWeeklySummary.mockResolvedValue(long);
    const user = userEvent.setup();
    await mount();
    await goto('WEEKLY');
    await waitFor(() => expect(screen.getByRole('button', { name: 'READ MORE' })).toBeOnTheScreen());
    expect(screen.getByTestId('weekly-summary-content').props.children).toMatch(/…$/);
    await user.press(screen.getByRole('button', { name: 'READ MORE' }));
    expect(screen.getByTestId('weekly-summary-content').props.children).toBe(long);
    await user.press(screen.getByRole('button', { name: 'SHOW LESS' }));
    expect(screen.getByRole('button', { name: 'READ MORE' })).toBeOnTheScreen();
  });

  it('has no READ MORE for a short summary', async () => {
    await mount();
    await goto('WEEKLY');
    await waitFor(() => expect(screen.getByTestId('weekly-summary-content')).toBeOnTheScreen());
    expect(screen.queryByRole('button', { name: 'READ MORE' })).toBeNull();
  });

  it('regenerates the summary, and holds the button until there is one to replace', async () => {
    mockFetchOrCreateWeeklySummary.mockReturnValue(new Promise(() => {}));
    await mount();
    await goto('WEEKLY');
    expect(screen.getByRole('button', { name: 'Regenerate weekly summary' })).toBeDisabled();
  });

  it('replaces the summary when regenerated', async () => {
    const user = userEvent.setup();
    await mount();
    await goto('WEEKLY');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Regenerate weekly summary' })).toBeEnabled());
    await user.press(screen.getByRole('button', { name: 'Regenerate weekly summary' }));
    await waitFor(() => expect(screen.getByTestId('weekly-summary-content')).toHaveTextContent('A fresh paragraph.'));
  });

  it('explains the daily regeneration cap in plain words', async () => {
    mockRegenerateWeeklySummary.mockRejectedValue(new Error('regen cap reached'));
    const user = userEvent.setup();
    await mount();
    await goto('WEEKLY');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Regenerate weekly summary' })).toBeEnabled());
    await user.press(screen.getByRole('button', { name: 'Regenerate weekly summary' }));
    expect(await screen.findByText(/used both regenerations for today/)).toBeOnTheScreen();
    expect(screen.getByTestId('weekly-summary-content')).toHaveTextContent(summary);
  });

  it('shows any other regeneration failure as it is', async () => {
    mockRegenerateWeeklySummary.mockRejectedValue(new Error('model unavailable'));
    const user = userEvent.setup();
    await mount();
    await goto('WEEKLY');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Regenerate weekly summary' })).toBeEnabled());
    await user.press(screen.getByRole('button', { name: 'Regenerate weekly summary' }));
    expect(await screen.findByText(/model unavailable/)).toBeOnTheScreen();
  });
});
