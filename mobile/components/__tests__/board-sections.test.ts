import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (relative: string) => readFileSync(resolve(__dirname, relative), 'utf8');

describe('mobile board section contract', () => {
  it('routes Daily, Recovery, One-Time and All Habits through the shared partition, and adds Backlog', () => {
    const board = source('../../app/(tabs)/board.tsx');
    expect(board).toContain('partitionBoardQuests');
    expect(board).toContain('RECOVERY REQUIRED');
    expect(board).toContain('DAILY QUEST');
    expect(board).toContain('ONE TIME QUEST');
    expect(board).toContain('BACKLOG');
    expect(board).toContain('ALL HABITS');
  });

  it('no longer has an Archived lane: archived quests live in the account menu', () => {
    const board = source('../../app/(tabs)/board.tsx');
    expect(board).not.toContain("'ARCHIVED'");
    expect(board).not.toContain('HabitCatalogRow');
  });

  it('keeps the All Habits catalogue free of completion controls', () => {
    const catalogue = source('../board/all-habits-sheet.tsx');
    expect(catalogue).toContain('Open ${habit.name} details');
    expect(catalogue).toContain('More actions for ${habit.name}');
    expect(catalogue).not.toContain('onToggle');
  });

  it('does not offer the long-press-to-complete-Penalty shortcut any more (web uses the Penalty only for recovery)', () => {
    const board = source('../../app/(tabs)/board.tsx');
    expect(board).not.toContain('completeEasy');
    expect(board).not.toContain('onCompleteEasy');
  });
});
