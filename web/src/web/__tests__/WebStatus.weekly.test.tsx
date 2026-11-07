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
  setProcessingConsent: vi.fn(),
  listeners: new Set<() => void>(),
  fireAccessChanged() { store.listeners.forEach(listener => listener()); },
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
    setProcessingConsent: store.setProcessingConsent,
    subscribeProcessingAccessChanges: (listener: () => void) => { store.listeners.add(listener); return () => { store.listeners.delete(listener); }; },
    fetchMailboxStatus: store.fetchMailboxStatus,
    sendMailboxCode: store.sendMailboxCode,
    verifyMailboxCode: store.verifyMailboxCode,
  };
});

import WebStatus from '../WebStatus';

const NEEDS_AI_BOXES = 'Weekly review needs the 18+ box, the AI agreement and a verified email. Turn it on from the Status page.';
afterEach(() => { cleanup(); focusManager.setFocused(undefined); store.listeners.clear(); });

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
  it('removes mailbox entry when the foreground check says the AI boxes are needed', async () => {
    await mailboxDraft();
    store.fetchOrCreateWeeklySummary.mockRejectedValue(new Error(NEEDS_AI_BOXES));
    await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await screen.findByText(/Weekly review needs the 18\+ box/);
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
    store.fetchOrCreateWeeklySummary.mockRejectedValue(new Error(NEEDS_AI_BOXES)); store.fireAccessChanged();
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
  it('hides a previously loaded AI summary after the AI permission changes while keeping the weekly review', async () => {
    const interaction = userEvent.setup(); renderStatus();
    await interaction.click(screen.getByRole('tab', { name: 'WEEKLY REVIEW' }));
    expect(await screen.findByText('A cached weekly reading.')).toBeInTheDocument();
    store.fetchOrCreateWeeklySummary.mockRejectedValue(new Error(NEEDS_AI_BOXES));
    store.fireAccessChanged();
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
    store.setProcessingConsent.mockReset();
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
  describe('the Turn on AI weekly review card', () => {
    const off = {contractVersion: 1, userId: 'user-1', ageVersion: 1, consentVersion: 1, authorityVersion: 0, mailboxVersion: 1,
      ageEligible: false, ageConsent: false, aiConsent: false, canReadDebrief: false, canGenerateDebrief: false, authorityState: 'not-required'};
    const afterAge = {...off, ageEligible: true, ageConsent: true, ageVersion: 2};
    const afterAi = {...afterAge, aiConsent: true, canReadDebrief: true, canGenerateDebrief: true, consentVersion: 2};
    it('is not shown when both boxes are already on', async () => {
      const interaction = userEvent.setup(); renderStatus();
      await interaction.click(screen.getByRole('tab', {name: 'WEEKLY REVIEW'}));
      await screen.findByText('A cached weekly reading.');
      expect(screen.queryByRole('heading', {name: 'Turn on AI weekly review'})).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
    it('is shown with both boxes when AI is off, and the old "AI permission is off" line and archive error stay away', async () => {
      store.fetchProcessingAccess.mockResolvedValue(off);
      store.fetchMailboxStatus.mockResolvedValue({userId: 'user-1', version: 1, verified: true});
      const interaction = userEvent.setup(); renderStatus();
      await interaction.click(screen.getByRole('tab', {name: 'WEEKLY REVIEW'}));
      expect(await screen.findByRole('heading', {name: 'Turn on AI weekly review'})).toBeInTheDocument();
      expect(screen.getByRole('checkbox', {name: /I'm 18 or older/i})).not.toBeChecked();
      expect(screen.getByRole('checkbox', {name: /Groq/})).not.toBeChecked();
      expect(screen.queryByText(/couldn.t reach the archive/)).not.toBeInTheDocument();
      expect(store.fetchOrCreateWeeklySummary).not.toHaveBeenCalled();
    });
    it('shows exactly one email verification box when AI is off and the email is unverified', async () => {
      store.fetchProcessingAccess.mockResolvedValue(off);
      const interaction = userEvent.setup(); renderStatus();
      await interaction.click(screen.getByRole('tab', {name: 'WEEKLY REVIEW'}));
      await screen.findByRole('heading', {name: 'Turn on AI weekly review'});
      expect(await screen.findAllByRole('button', {name: 'Send verification email'})).toHaveLength(1);
      expect(screen.getAllByRole('button', {name: 'Check verification status'})).toHaveLength(1);
    });
    it('shows the card above saved history when AI was turned off but reading is still allowed', async () => {
      store.fetchProcessingAccess.mockResolvedValue({...afterAge, canReadDebrief: true});
      store.fetchSavedWeeklySummary.mockResolvedValue('Saved history after withdrawal.');
      store.fetchMailboxStatus.mockResolvedValue({userId: 'user-1', version: 1, verified: true});
      const interaction = userEvent.setup(); renderStatus();
      await interaction.click(screen.getByRole('tab', {name: 'WEEKLY REVIEW'}));
      await screen.findByText('Saved history after withdrawal.');
      expect(screen.getByRole('heading', {name: 'Turn on AI weekly review'})).toBeInTheDocument();
      expect(screen.queryByRole('checkbox', {name: /I'm 18 or older/i})).not.toBeInTheDocument();
      expect(screen.getByRole('checkbox', {name: /Groq/})).not.toBeChecked();
    });
    it('keeps the card and the ticked AI box on screen between the two saves', async () => {
      let server: typeof off = off, release!: (value: typeof afterAi) => void;
      store.fetchProcessingAccess.mockImplementation(async () => server);
      store.fetchMailboxStatus.mockResolvedValue({userId: 'user-1', version: 1, verified: true});
      store.setProcessingConsent.mockImplementationOnce(async () => { server = afterAge; store.fireAccessChanged(); return afterAge; })
        .mockImplementationOnce(() => new Promise(resolve => { release = value => { server = value; store.fireAccessChanged(); resolve(value); }; }));
      const interaction = userEvent.setup(); renderStatus();
      await interaction.click(screen.getByRole('tab', {name: 'WEEKLY REVIEW'}));
      await interaction.click(await screen.findByRole('checkbox', {name: /I'm 18 or older/i}));
      await interaction.click(screen.getByRole('checkbox', {name: /Groq/}));
      await interaction.click(await screen.findByRole('button', {name: 'Turn on'}));
      await waitFor(() => expect(store.setProcessingConsent).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('checkbox', {name: /I'm 18 or older/i})).not.toBeInTheDocument());
      expect(screen.getByRole('checkbox', {name: /Groq/})).toBeChecked();
      expect(screen.getByRole('heading', {name: 'Turn on AI weekly review'})).toBeInTheDocument();
      await act(async () => { release(afterAi); });
    });
    it('finishes both saves and then writes the review even though each save tells the screen to re-read access', async () => {
      let server: typeof off = off;
      store.fetchProcessingAccess.mockImplementation(async () => server);
      store.fetchMailboxStatus.mockResolvedValue({userId: 'user-1', version: 1, verified: true});
      // The real setProcessingConsent tells every listener before it returns; so does this stand-in.
      store.setProcessingConsent.mockImplementation(async (purpose: string) => {
        server = purpose === 'age-screening' ? afterAge : afterAi; store.fireAccessChanged();
        return server;
      });
      store.fetchOrCreateWeeklySummary.mockResolvedValue('A fresh review after turning on.');
      const interaction = userEvent.setup(); renderStatus();
      await interaction.click(screen.getByRole('tab', {name: 'WEEKLY REVIEW'}));
      await interaction.click(await screen.findByRole('checkbox', {name: /I'm 18 or older/i}));
      await interaction.click(screen.getByRole('checkbox', {name: /Groq/}));
      await interaction.click(await screen.findByRole('button', {name: 'Turn on'}));
      expect(await screen.findByText('A fresh review after turning on.')).toBeInTheDocument();
      expect(store.setProcessingConsent).toHaveBeenCalledTimes(2);
      expect(store.setProcessingConsent).toHaveBeenNthCalledWith(2, 'weekly-debrief', true, '2026-11-08-weekly-debrief-v2', afterAge);
      expect(screen.queryByRole('heading', {name: 'Turn on AI weekly review'})).not.toBeInTheDocument();
    });
  });
});
