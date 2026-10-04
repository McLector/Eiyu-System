// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import type { Quest } from '@eiyu/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QuestDetailsDialog from '../QuestDetailsDialog';

afterEach(cleanup);

const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'q1', name: 'Reach out to someone', stat: 'CHA', difficulty: 'Easy', easyVersion: 'Send a voice message', description: 'Someone I have not talked to in a month.',
  questType: 'habit', archived: false, time: '18:00', days: [1, 3, 5], streak: 12, frozen: false, completed: false, targetCount: null, progressCount: 0, ...over,
});

describe('QuestDetailsDialog', () => {
  it('shows the quest read-only with its note, penalty, schedule and streak', () => {
    render(<QuestDetailsDialog quest={quest()} onClose={vi.fn()} onEdit={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Quest details' });
    expect(within(dialog).getByRole('heading', { name: 'Reach out to someone', level: 3 })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Mon, Wed, Fri at 18:00 · 12-day streak');
    expect(dialog).toHaveTextContent('Someone I have not talked to in a month.');
    expect(dialog).toHaveTextContent('Send a voice message');
    expect(dialog.querySelectorAll('input, textarea, select')).toHaveLength(0);
  });

  it('labels a One-time quest with its real date unless it is scheduled for today and live', () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).format(new Date());
    const one = (over: Partial<Quest>) => quest({ questType: 'one_time', days: [], easyVersion: null, timeSet: true, time: '09:30', streak: 0, ...over });
    const { unmount } = render(<QuestDetailsDialog quest={one({ scheduledDate: today })} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Today at 09:30');
    unmount();
    const past = render(<QuestDetailsDialog quest={one({ scheduledDate: '2026-01-02', archived: true })} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('2026-01-02 at 09:30');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Today');
    past.unmount();
    render(<QuestDetailsDialog quest={one({ scheduledDate: today, archived: true, timeSet: false })} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveTextContent(`${today}, any time`);
  });

  it('opens the editor from Edit Quest', async () => {
    const onEdit = vi.fn();
    render(<QuestDetailsDialog quest={quest()} onClose={vi.fn()} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Quest' }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('describes One-time and Backlog quests without a penalty, with their genre', () => {
    render(<QuestDetailsDialog quest={quest({ questType: 'backlog', days: [], easyVersion: null, genre: 'software_idea', timeSet: false })} onClose={vi.fn()} onEdit={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Quest details' });
    expect(dialog).toHaveTextContent('Software idea');
    expect(dialog).toHaveTextContent('No date yet');
    expect(dialog).not.toHaveTextContent('PENALTY');
  });

  it('says a One-time quest has no set time', () => {
    render(<QuestDetailsDialog quest={quest({ questType: 'one_time', days: [], easyVersion: null, timeSet: false })} onClose={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Today, any time');
  });

  it('keeps a 480-character note with line breaks and an unbroken word wrappable', () => {
    const note = `${'word '.repeat(50)}\n${'x'.repeat(200)}`;
    render(<QuestDetailsDialog quest={quest({ description: note })} onClose={vi.fn()} onEdit={vi.fn()} />);
    const paragraph = screen.getByText(/word word/);
    expect(paragraph).toHaveClass('details-note');
    expect(paragraph.textContent).toContain('x'.repeat(200));
  });

  it('offers Restore and Delete, and no Edit, for an archived quest', async () => {
    const onRestore = vi.fn();
    const onDelete = vi.fn();
    render(<QuestDetailsDialog quest={quest({ archived: true })} onClose={vi.fn()} onEdit={vi.fn()} archived={{ pending: false, onRestore, onDelete }} />);
    expect(screen.queryByRole('button', { name: 'Edit Quest' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onRestore).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
