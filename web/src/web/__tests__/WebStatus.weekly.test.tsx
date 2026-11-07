// @vitest-environment jsdom

import { QueryClient, QueryClientProvider, onlineManager, focusManager } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
  fetchProcessingAccess: vi.fn(),
  fetchSavedWeeklySummary: vi.fn(),
  fetchMailboxStatus: vi.fn(async () => ({ userId: 'user-1', version: 1, verified: false })),
  sendMailboxCode: vi.fn(),
  verifyMailboxCode: vi.fn(),
  onAgeChanged: null as null | (() => void),
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
    fetchProcessingAccess: store.fetchProcessingAccess,
    fetchSavedWeeklySummary: store.fetchSavedWeeklySummary,
    subscribeProcessingAccessChanges: () => () => {},
    fetchMailboxStatus: store.fetchMailboxStatus,
    sendMailboxCode: store.sendMailboxCode,
    verifyMailboxCode: store.verifyMailboxCode,
    subscribeAccountAgeChanges: (listener: () => void) => { store.onAgeChanged = listener; return () => { store.onAgeChanged = null; }; },
  };
});

import WebStatus from '../WebStatus';

afterEach(() => { cleanup(); focusManager.setFocused(undefined); });

function renderStatus(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
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
  it('does not invoke generation on mount or refocus without AI consent and permits saved reading', async () => {
    store.fetchProcessingAccess.mockResolvedValue({...await store.fetchProcessingAccess(), aiConsent: false, canGenerateDebrief: false});
    store.fetchSavedWeeklySummary.mockResolvedValue('Saved history after withdrawal.');
    renderStatus(); await userEvent.setup().click(screen.getByRole('tab', {name: 'WEEKLY REVIEW'}));
    await screen.findByText('Saved history after withdrawal.');
    await act(async () => {focusManager.setFocused(false); focusManager.setFocused(true);});
    await waitFor(() => expect(store.fetchSavedWeeklySummary).toHaveBeenCalledTimes(2));
    expect(store.fetchOrCreateWeeklySummary).not.toHaveBeenCalled();
    expect(screen.getByRole('button', {name: 'Regenerate weekly summary'})).toBeDisabled();
  });
  async function mailboxDraft() {
    store.fetchOrCreateWeeklySummary.mockRejectedValue(new Error('Verify your email to access your weekly debrief.'));
    const interaction = userEvent.setup(); renderStatus();
    await interaction.click(screen.getByRole('tab', {name: 'WEEKLY REVIEW'}));
    await interaction.click(await screen.findByRole('button', {name: 'Send verification email'}));
    await interaction.type(await screen.findByLabelText('Verification code'), '12345678');
    return interaction;
  }
  it('keeps the pending mailbox draft while returning from another tab rechecks eligibility', async () => {
    await mailboxDraft();
    let reject!: (reason: Error) => void;
    store.fetchOrCreateWeeklySummary.mockReturnValue(new Promise<string>((_resolve, fail) => { reject = fail; }));
    await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await waitFor(() => expect(store.fetchOrCreateWeeklySummary).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Verification code')).toHaveValue('12345678');
    await act(async () => { reject(new Error('Verify your email to access your weekly debrief.')); });
    expect(await screen.findByLabelText('Verification code')).toHaveValue('12345678');
    expect(store.sendMailboxCode).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('A cached weekly reading.')).not.toBeInTheDocument();
  });
  it('keeps the code box when the tab regains focus while the code request is still in flight', async () => {
    store.fetchOrCreateWeeklySummary.mockRejectedValue(new Error('Verify your email to access your weekly debrief.'));
    let sent!: (value: {challengeId: string; retryAfter: number}) => void;
    store.sendMailboxCode.mockReturnValueOnce(new Promise(resolve => { sent = resolve; }));
    const interaction = userEvent.setup(); renderStatus();
    await interaction.click(screen.getByRole('tab', {name: 'WEEKLY REVIEW'}));
    await interaction.click(await screen.findByRole('button', {name: 'Send verification email'}));
    await waitFor(() => expect(store.sendMailboxCode).toHaveBeenCalledTimes(1));
    await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await waitFor(() => expect(store.fetchOrCreateWeeklySummary).toHaveBeenCalledTimes(2));
    await act(async () => { sent({challengeId: 'challenge', retryAfter: 60}); });
    expect(await screen.findByLabelText('Verification code')).toBeEnabled();
    expect(store.sendMailboxCode).toHaveBeenCalledTimes(1);
  });
  it('clears the pending draft after returning to a changed mailbox version', async () => {
    await mailboxDraft();
    store.fetchMailboxStatus.mockResolvedValue({userId: 'user-1', version: 2, verified: false});
    await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await waitFor(() => expect(store.fetchMailboxStatus).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument());
  });
  it('shows a successful debrief after proof without repeated completion refetches', async () => {
    const interaction = await mailboxDraft();
    store.fetchMailboxStatus.mockResolvedValue({userId: 'user-1', version: 1, verified: true});
    store.fetchOrCreateWeeklySummary.mockResolvedValue('Verified summary after mailbox proof.');
    await interaction.click(screen.getByRole('button', {name: 'Verify code'}));
    expect(await screen.findByText('Verified summary after mailbox proof.')).toBeInTheDocument();
    expect(store.fetchOrCreateWeeklySummary).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
  });
  it('removes mailbox entry when the foreground eligibility check denies adult AI', async () => {
    await mailboxDraft();
    store.fetchOrCreateWeeklySummary.mockRejectedValue(new Error('Adult AI eligibility required.'));
    await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await screen.findByText(/Adult AI eligibility required/);
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
    expect(screen.getByRole('table', {name: /weekly activity/i})).toBeInTheDocument();
  });
  it('hides an old cached debrief while offline validation is paused', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['weeklySummary', 'user-1'], 'Offline private content');
    onlineManager.setOnline(false);
    try {
      renderStatus(queryClient);
      await userEvent.setup().click(screen.getByRole('tab', { name: 'WEEKLY REVIEW' }));
      expect(screen.queryByText('Offline private content')).not.toBeInTheDocument();
    } finally { cleanup(); onlineManager.setOnline(true); }
  });
  it('discards a regeneration that completes after eligibility invalidation', async () => {
    let resolve!: (value: string) => void;
    store.regenerateWeeklySummary.mockReturnValue(new Promise<string>(done => { resolve = done; }));
    const user = userEvent.setup(); renderStatus(); await user.click(screen.getByRole('tab', { name: 'WEEKLY REVIEW' }));
    await screen.findByText('A cached weekly reading.'); await user.click(screen.getByRole('button', { name: 'Regenerate weekly summary' }));
    store.fetchOrCreateWeeklySummary.mockRejectedValue(new Error('Adult AI eligibility required.')); store.onAgeChanged?.();
    await waitFor(() => expect(screen.queryByText('A cached weekly reading.')).not.toBeInTheDocument());
    resolve('Late private content');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Regenerate weekly summary' })).not.toHaveTextContent('REGENERATING'));
    expect(screen.queryByText('Late private content')).not.toBeInTheDocument();
  });
  it('offers verification without hiding weekly quest activity', async () => {
    store.fetchOrCreateWeeklySummary.mockRejectedValue(new Error('Verify your email to access your weekly debrief.'));
    const interaction = userEvent.setup(); renderStatus();
    await interaction.click(screen.getByRole('tab', { name: 'WEEKLY REVIEW' }));
    expect(await screen.findByRole('button', { name: 'Send verification email' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /weekly activity/i })).toBeInTheDocument();
    expect(screen.queryByText('A cached weekly reading.')).not.toBeInTheDocument();
  });
  it('hides a previously loaded AI summary after a birthday change while keeping the weekly review', async () => {
    const interaction = userEvent.setup(); renderStatus();
    await interaction.click(screen.getByRole('tab', { name: 'WEEKLY REVIEW' }));
    expect(await screen.findByText('A cached weekly reading.')).toBeInTheDocument();
    store.fetchOrCreateWeeklySummary.mockRejectedValue(new Error('Adult AI eligibility required.'));
    store.onAgeChanged?.();
    await waitFor(() => expect(screen.queryByText('A cached weekly reading.')).not.toBeInTheDocument());
    expect(screen.getByRole('table', { name: /weekly activity/i })).toBeInTheDocument();
  });
  beforeEach(() => {
    store.useEiyu.mockReturnValue({ user: { ...initialUser, rank: 'E', timeZone: 'America/Los_Angeles' } });
    store.useSession.mockReturnValue({ user: { id: 'user-1' } });
    store.fetchWeeklyReview.mockReset().mockResolvedValue(weeklyData);
    store.fetchOrCreateWeeklySummary.mockReset().mockResolvedValue('A cached weekly reading.');
    store.regenerateWeeklySummary.mockReset().mockResolvedValue('A regenerated weekly reading.');
    store.fetchProcessingAccess.mockReset().mockResolvedValue({contractVersion: 1, userId: 'user-1', ageVersion: 1, consentVersion: 1, authorityVersion: 0, mailboxVersion: 1,
      ageEligible: true, ageConsent: true, aiConsent: true, canReadDebrief: true, canGenerateDebrief: true, authorityState: 'not-required'});
    store.fetchSavedWeeklySummary.mockReset().mockResolvedValue(null);
    store.fetchMailboxStatus.mockReset().mockResolvedValue({userId: 'user-1', version: 1, verified: false});
    store.sendMailboxCode.mockReset().mockResolvedValue({challengeId: 'challenge', retryAfter: 60});
    store.verifyMailboxCode.mockReset().mockResolvedValue({userId: 'user-1', version: 1, verified: true});
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
