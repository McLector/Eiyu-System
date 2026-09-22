import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mobile board section contract', () => {
  it('renders Daily, Recovery, One-Time, and All Habits from the shared partition', () => {
    const board = readFileSync(
      resolve(__dirname, '../../app/(tabs)/board.tsx'),
      'utf8'
    );
    expect(board).toContain('partitionBoardQuests');
    expect(board).toContain('RECOVERY REQUIRED');
    expect(board).toContain('DAILY QUEST');
    expect(board).toContain('ONE TIME QUEST');
    expect(board).toContain('ALL HABITS');
    expect(board).toContain('ARCHIVED');

    const catalogRow = board.slice(
      board.indexOf('function HabitCatalogRow'),
      board.indexOf('export default function BoardScreen')
    );
    expect(catalogRow).toContain('accessibilityLabel={`Edit ${quest.name}`}');
    expect(catalogRow).not.toContain('onToggle');
  });
});
