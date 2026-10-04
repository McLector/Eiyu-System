// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { initialUser } from '@eiyu/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toggleStage = vi.hoisted(() => vi.fn());
vi.mock('../store/eiyu-store', () => ({ useEiyu: () => ({
  user: { ...initialUser, longQuests: [{ id: 'q', name: 'Campaign', stat: 'INT', description: null, stages: [
    { id: 's1', name: 'Plan', done: false, description: null },
    { id: 's2', name: 'Build', done: false, description: 'Complete planning first.' },
  ] }] },
  pendingStageIds: ['s1'], toggleStage, longQuestsLoading: false, longQuestsError: null,
}) }));
import WebLongQuests from '../web/WebLongQuests';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('Long Quest sequence controls', () => {
  it('keeps locked stages focusable without completing them and disables pending saves', async () => {
    const user = userEvent.setup();
    render(<WebLongQuests />);
    // The first chain opens by default.
    expect(screen.getByRole('button', { name: /Campaign/ })).toHaveAttribute('aria-expanded', 'true');
    const locked = document.getElementById('stage-s2')!;
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    await user.click(locked);
    expect(toggleStage).not.toHaveBeenCalled();
    expect(document.getElementById('stage-s1')).toBeDisabled();
    await waitFor(() => expect(locked).toHaveFocus());
    expect(locked).toHaveAccessibleName('Build. Complete earlier stages first.');
    // A locked stage keeps its details one click away.
    expect(screen.queryByText('Complete planning first.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show details for Build' }));
    expect(screen.getByText('Complete planning first.')).toBeVisible();
  });
});
