// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../store/session-context', () => ({ useSession: () => ({ user: { id: 'owner-1' } }) }));

import ArchiveNotice, { announceArchive } from '../components/ArchiveNotice';

afterEach(cleanup);

describe('archive notice Undo', () => {
  it('offers Undo only when the archive can be undone, and runs it once', async () => {
    const user = userEvent.setup();
    const undo = vi.fn().mockResolvedValue(undefined);
    render(<ArchiveNotice onOpen={vi.fn()} />);
    act(() => announceArchive('habit', 'owner-1', undo));
    await user.click(await screen.findByRole('button', { name: /Undo/ }));
    expect(undo).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('shows no Undo button for an announcement without one', async () => {
    render(<ArchiveNotice onOpen={vi.fn()} />);
    act(() => announceArchive('habit', 'owner-1'));
    await screen.findByText('Habit archived ✓');
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
  });

  it('says so when Undo fails instead of dropping the error', async () => {
    const user = userEvent.setup();
    render(<ArchiveNotice onOpen={vi.fn()} />);
    act(() => announceArchive('habit', 'owner-1', () => Promise.reject(new Error('offline'))));
    await user.click(await screen.findByRole('button', { name: /Undo/ }));
    expect(await screen.findByText(/Could not undo that/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View archived habits' })).toBeNull();
  });

  it('still opens the archived list from View archived habits', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ArchiveNotice onOpen={onOpen} />);
    act(() => announceArchive('one_time', 'owner-1'));
    await user.click(await screen.findByRole('button', { name: 'View archived habits' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('keeps the timer bar in step with the real remaining time when a dialog opens mid-notice', async () => {
    vi.useFakeTimers();
    try {
      render(<ArchiveNotice onOpen={vi.fn()} />);
      act(() => announceArchive('habit', 'owner-1'));
      const before = document.querySelector('.archive-notice-timer')!;
      expect(before).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(3000); });
      const dialog = document.createElement('div');
      dialog.setAttribute('data-eiyu-dialog', '');
      dialog.innerHTML = '<div class="compact-dialog-body"></div>';
      await act(async () => { document.body.appendChild(dialog); await Promise.resolve(); });
      const after = document.querySelector('.archive-notice-timer') as HTMLElement;
      expect(dialog.contains(after)).toBe(true);
      expect(after.style.animationDelay).toBe('-3000ms');
      dialog.remove();
    } finally { vi.useRealTimers(); }
  });
});
