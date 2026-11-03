// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchNotice = vi.hoisted(() => vi.fn());
vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<typeof import('@eiyu/shared')>(),
  fetchRetentionNotice: (...args: unknown[]) => fetchNotice(...args),
}));
import RetentionNotice from '../RetentionNotice';

afterEach(cleanup);
beforeEach(() => fetchNotice.mockReset());

describe('RetentionNotice', () => {
  it('names the removal date and how to stop it when a reminder is due', async () => {
    fetchNotice.mockResolvedValue([{ purpose: 'custom-tracker', removalDueOn: '2026-10-31', reminded: true }]);
    render(<RetentionNotice userId="owner-a" />);
    const note = await screen.findByRole('status');
    expect(note).toHaveTextContent('Your custom quest records will be removed on October 31, 2026 unless you turn custom tracking back on');
    expect(fetchNotice).toHaveBeenCalledWith('owner-a');
  });
  it('words the fitness purpose for Gym records', async () => {
    fetchNotice.mockResolvedValue([{ purpose: 'fitness-tracking', removalDueOn: '2026-11-02', reminded: true }]);
    render(<RetentionNotice userId="owner-a" />);
    expect(await screen.findByRole('status')).toHaveTextContent(/Your Gym records will be removed on November 2, 2026 unless you turn fitness tracking back on/);
  });
  it('shows one line per due purpose', async () => {
    fetchNotice.mockResolvedValue([
      { purpose: 'custom-tracker', removalDueOn: '2026-10-31', reminded: true },
      { purpose: 'fitness-tracking', removalDueOn: '2026-11-02', reminded: true },
    ]);
    render(<RetentionNotice userId="owner-a" />);
    await waitFor(() => expect(screen.getAllByRole('status')).toHaveLength(2));
  });
  it('shows nothing before the reminder is due', async () => {
    fetchNotice.mockResolvedValue([{ purpose: 'custom-tracker', removalDueOn: '2026-10-31', reminded: false }]);
    render(<RetentionNotice userId="owner-a" />);
    await waitFor(() => expect(fetchNotice).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('shows nothing when there is no notice or the read fails', async () => {
    fetchNotice.mockResolvedValueOnce([]);
    const first = render(<RetentionNotice userId="owner-a" />);
    await waitFor(() => expect(fetchNotice).toHaveBeenCalledTimes(1));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();
    fetchNotice.mockRejectedValueOnce(new Error('x'));
    const second = render(<RetentionNotice userId="owner-a" />);
    await waitFor(() => expect(fetchNotice).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
  });
  it('ignores a late answer for a previous owner', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    fetchNotice.mockReturnValueOnce(new Promise(r => { resolve = r; })).mockResolvedValue([]);
    const view = render(<RetentionNotice userId="owner-a" />);
    view.rerender(<RetentionNotice userId="owner-b" />);
    resolve([{ purpose: 'custom-tracker', removalDueOn: '2026-10-31', reminded: true }]);
    await waitFor(() => expect(fetchNotice).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
