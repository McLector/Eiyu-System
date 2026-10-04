// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser } from '@eiyu/shared';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  useEiyu: vi.fn(),
  useSession: vi.fn(),
  fetchWeeklyReview: vi.fn(),
  fetchOrCreateWeeklySummary: vi.fn(),
  regenerateWeeklySummary: vi.fn(),
}));

vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));
vi.mock('../../store/session-context', () => ({ useSession: store.useSession }));
vi.mock('../WebHeatmap', () => ({ default: () => <div data-testid="heatmap" /> }));
vi.mock('recharts', () => ({
  RadarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Radar: () => <div />,
  PolarGrid: () => <div />,
  PolarAngleAxis: () => <div />,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => <div />,
}));
vi.mock('@eiyu/shared', async importActual => {
  const actual = await importActual<typeof import('@eiyu/shared')>();
  return {
    ...actual,
    fetchWeeklyReview: store.fetchWeeklyReview,
    fetchOrCreateWeeklySummary: store.fetchOrCreateWeeklySummary,
    regenerateWeeklySummary: store.regenerateWeeklySummary,
  };
});

import WebStatus from '../WebStatus';

afterEach(cleanup);

function renderStatus() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <WebStatus darkMode />
    </QueryClientProvider>
  );
}

const weeklyData = [
  { dateKey: '2026-12-25', day: 'Fri', STR: 1, INT: 0, DEX: 0, WIS: 0, CHA: 0 },
  { dateKey: '2026-12-26', day: 'Sat', STR: 0, INT: 3, DEX: 0, WIS: 0, CHA: 0 },
  { dateKey: '2026-12-27', day: 'Sun', STR: 0, INT: 0, DEX: 4, WIS: 0, CHA: 0 },
  { dateKey: '2026-12-28', day: 'Mon', STR: 0, INT: 0, DEX: 0, WIS: 10, CHA: 0 },
  { dateKey: '2026-12-29', day: 'Tue', STR: 0, INT: 0, DEX: 0, WIS: 0, CHA: 1 },
  { dateKey: '2026-12-30', day: 'Wed', STR: 0, INT: 0, DEX: 0, WIS: 0, CHA: 2 },
  { dateKey: '2026-12-31', day: 'Thu', STR: 0, INT: 0, DEX: 0, WIS: 0, CHA: 0 },
];

describe('web Status weekly review', () => {
  beforeEach(() => {
    store.useEiyu.mockReturnValue({ user: { ...initialUser, rank: 'E', timeZone: 'America/Los_Angeles' } });
    store.useSession.mockReturnValue({ user: { id: 'user-1' } });
    store.fetchWeeklyReview.mockReset().mockResolvedValue(weeklyData);
    store.fetchOrCreateWeeklySummary.mockReset().mockResolvedValue('A cached weekly reading.');
    store.regenerateWeeklySummary.mockReset().mockResolvedValue('A regenerated weekly reading.');
  });

  it('keeps exact values visible in the weekly table and allows a bounded retry', async () => {
    const interaction = userEvent.setup();
    renderStatus();
    await interaction.click(screen.getByRole('tab', { name: 'WEEKLY REVIEW' }));

    expect(await screen.findByRole('table', { name: /weekly activity/i })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: /WIS.*December 28, 2026.*10/i })).toHaveTextContent('10');
    expect(screen.getAllByRole('columnheader')).toHaveLength(8);

    store.fetchWeeklyReview.mockRejectedValueOnce(new Error('offline'));
    await interaction.click(screen.getByRole('tab', { name: 'STATS' }));
    await interaction.click(screen.getByRole('tab', { name: 'WEEKLY REVIEW' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("The System couldn't read this week's data.");
    store.fetchWeeklyReview.mockResolvedValueOnce(weeklyData);
    await interaction.click(screen.getByRole('button', { name: 'RETRY' }));
    await waitFor(() => expect(screen.getByRole('table', { name: /weekly activity/i })).toBeInTheDocument());
  });

  it('preserves the server-side two-regeneration limit in the web controls', async () => {
    const interaction = userEvent.setup();
    renderStatus();
    await interaction.click(screen.getByRole('tab', { name: 'WEEKLY REVIEW' }));
    expect(await screen.findByText('A cached weekly reading.')).toBeInTheDocument();
    store.regenerateWeeklySummary.mockRejectedValueOnce(new Error('regen cap reached'));

    await interaction.click(screen.getByRole('button', { name: 'Regenerate weekly summary' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("You've used both regenerations for today");
  });
});
