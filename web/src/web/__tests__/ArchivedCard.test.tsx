// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import type { Quest } from '@eiyu/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArchivedCard from '../ArchivedCard';

afterEach(cleanup);

const quest: Quest = {
  id: 'q1', name: 'Walk', stat: 'STR', difficulty: 'Medium', easyVersion: 'One minute', description: null, questType: 'habit',
  archived: true, time: '08:00', days: [1], streak: 0, frozen: false, completed: false, targetCount: null, progressCount: 0,
};

describe('ArchivedCard', () => {
  it('opens the read-only details from the card and keeps Restore and Delete one tap away', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onRestore = vi.fn();
    const onDelete = vi.fn();
    render(<ArchivedCard quest={quest} pending={false} onOpen={onOpen} onRestore={onRestore} onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: 'View Walk details' }));
    await user.click(screen.getByRole('button', { name: 'Restore Walk' }));
    await user.click(screen.getByRole('button', { name: 'Delete Walk' }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onRestore).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Restore Walk' })).toHaveClass('btn-quiet', 'btn-compact');
    expect(screen.getByRole('button', { name: 'Delete Walk' })).toHaveClass('btn-destructive', 'btn-compact');
  });

  it('disables both actions while a restore is in flight', () => {
    render(<ArchivedCard quest={quest} pending onOpen={vi.fn()} onRestore={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Restore Walk' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Walk' })).toBeDisabled();
  });

  it('labels only the quest being restored as RESTORING, but disables the others too', () => {
    render(<ArchivedCard quest={quest} pending restoring={false} onOpen={vi.fn()} onRestore={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Restore Walk' })).toHaveTextContent('RESTORE');
    expect(screen.getByRole('button', { name: 'Restore Walk' })).not.toHaveTextContent('RESTORING');
    expect(screen.getByRole('button', { name: 'Restore Walk' })).toBeDisabled();
  });
});
