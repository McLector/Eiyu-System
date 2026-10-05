// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { accountDateKey, addDateKeyDays, type HistoryByDate } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A plain function, not vi.fn: the spy would re-raise a rejected promise as an unhandled error in the failure test.
const history = vi.hoisted(() => ({ load: (async () => ({})) as () => Promise<unknown> }));
vi.mock('@eiyu/shared', async importOriginal => ({ ...(await importOriginal<typeof import('@eiyu/shared')>()), fetchHistoryRange: () => history.load() }));
import WebHeatmap from '../WebHeatmap';

const today = accountDateKey(new Date(), 'UTC');
const daysAgo = (n: number) => addDateKeyDays(today, -n);
const label = (dateKey: string) => new Date(`${dateKey}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const days = (): HistoryByDate => ({
  [today]: { completedCount: 2, scheduledCount: 3, completions: [{ habitName: 'Morning run', kind: 'normal' }, { habitName: 'Read ten pages', kind: 'normal' }] },
  [daysAgo(1)]: { completedCount: 0, scheduledCount: 0, completions: [] },
  [daysAgo(2)]: { completedCount: 1, scheduledCount: 2, completions: [{ habitName: 'Stretch', kind: 'easy' }] },
});

function renderHeatmap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><WebHeatmap userId="u1" timeZone="UTC" /></QueryClientProvider>);
}
const cell = (dateKey: string) => screen.getByRole('button', { name: new RegExp(label(dateKey)) });

beforeEach(() => { history.load = async () => days(); });
afterEach(cleanup);

describe('WebHeatmap day detail', () => {
  it('opens the picked day in a modal instead of rendering it under the grid', async () => {
    const user = userEvent.setup();
    renderHeatmap();
    await waitFor(() => expect(cell(today)).toBeEnabled());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Click a day to see details.')).toBeNull();
    await user.click(cell(today));
    const dialog = screen.getByRole('dialog', { name: `Today · ${label(today)}` });
    expect(within(dialog).getByText('2/3 completed')).toBeInTheDocument();
    expect(within(dialog).getByText('Morning run')).toBeInTheDocument();
    expect(within(dialog).getByText('Read ten pages')).toBeInTheDocument();
  });

  it('titles a past day with its date alone', async () => {
    const user = userEvent.setup();
    renderHeatmap();
    await waitFor(() => expect(cell(daysAgo(2))).toBeEnabled());
    await user.click(cell(daysAgo(2)));
    const dialog = screen.getByRole('dialog', { name: label(daysAgo(2)) });
    expect(within(dialog).getByText('1/2 completed')).toBeInTheDocument();
    expect(within(dialog).getByText('Stretch')).toBeInTheDocument();
  });

  it('says so when nothing was completed that day', async () => {
    const user = userEvent.setup();
    renderHeatmap();
    await waitFor(() => expect(cell(daysAgo(1))).toBeEnabled());
    await user.click(cell(daysAgo(1)));
    expect(within(screen.getByRole('dialog')).getByText('Nothing completed this day.')).toBeInTheDocument();
  });

  it('closes from the close button and from Escape, and clears the selection ring', async () => {
    const user = userEvent.setup();
    renderHeatmap();
    await waitFor(() => expect(cell(today)).toBeEnabled());
    await user.click(cell(today));
    await user.click(screen.getByRole('button', { name: `Close Today · ${label(today)}` }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(cell(today)).toHaveFocus();
    expect(cell(today).style.border).not.toContain('1.5px');
    await user.click(cell(daysAgo(2)));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('switches day by closing and picking another, never stacking two modals', async () => {
    const user = userEvent.setup();
    renderHeatmap();
    await waitFor(() => expect(cell(today)).toBeEnabled());
    await user.click(cell(today));
    await user.keyboard('{Escape}');
    await user.click(cell(daysAgo(2)));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: label(daysAgo(2)) })).toBeInTheDocument();
  });

  it('keeps every day disabled until the archive has answered', async () => {
    let resolve!: (value: HistoryByDate) => void;
    const pending = new Promise<HistoryByDate>(r => { resolve = r; });
    history.load = () => pending;
    renderHeatmap();
    expect(screen.getByText('Reading the archive…')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    resolve(days());
    await waitFor(() => expect(cell(today)).toBeEnabled());
    expect(screen.queryByText('Reading the archive…')).toBeNull();
  });

  it('shows no day buttons and no modal when the archive fails', async () => {
    history.load = async () => { throw new Error('offline'); };
    renderHeatmap();
    expect(await screen.findByText("The archive didn't respond.")).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
