// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
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
  it('never completes a locked stage, disables a saving one, and keeps locked details one action away', async () => {
    const user = userEvent.setup();
    render(<WebLongQuests />);
    // The first chain is selected by default.
    expect(screen.getByRole('button', { name: /Campaign/ })).toHaveAttribute('aria-current', 'true');
    // Plan is current but still saving, so its action is disabled.
    expect(screen.getByRole('button', { name: 'COMPLETE STAGE' })).toBeDisabled();
    // Build is locked: nothing completes it, and the reason is exposed instead of a dead control.
    const locked = document.querySelector<HTMLElement>('[data-item-id="s2"]')!;
    expect(within(locked).queryByRole('button', { name: /COMPLETE/ })).toBeNull();
    expect(locked).toHaveTextContent('Complete earlier stages first.');
    await user.click(locked);
    expect(toggleStage).not.toHaveBeenCalled();
    // A locked stage keeps its details one action away.
    expect(screen.queryByText('Complete planning first.')).toBeNull();
    await user.click(within(locked).getByRole('button', { name: 'Actions for Build' }));
    await user.click(screen.getByRole('menuitem', { name: 'Show details' }));
    expect(screen.getByText('Complete planning first.')).toBeVisible();
  });
});
