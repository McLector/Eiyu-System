import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(relativePath: string) {
  return readFileSync(resolve(__dirname, relativePath), 'utf8');
}

describe('Penalty terminology on active mobile surfaces', () => {
  it('uses Penalty in the habit editor and suggestion action', () => {
    const editor = source('../../app/quest-editor.tsx');
    expect(editor).toContain('label="Penalty"');
    expect(editor).toContain('SUGGEST PENALTIES');
    expect(editor).not.toContain('EASY VERSION');
    expect(editor).not.toContain('SUGGEST EASY VERSIONS');
  });

  it('uses Penalty on the recovery sheet, and never the old "easy version" wording on any Board surface', () => {
    expect(source('../board/recovery-sheet.tsx')).toContain('Penalty:');
    for (const file of [
      '../../app/(tabs)/board.tsx',
      '../board/recovery-sheet.tsx',
      '../board/quest-details-sheet.tsx',
      '../board/quest-row.tsx',
      '../board/all-habits-sheet.tsx',
    ]) {
      const code = source(file);
      expect(code).not.toContain('Easy version:');
      expect(code).not.toContain('Complete easy version');
    }
  });

  it('names the Penalty in the quest details', () => {
    expect(source('../board/quest-details-sheet.tsx')).toContain('PENALTY');
  });

  it('uses Penalty in history and recovery notifications', () => {
    const history = source('../../app/history.tsx');
    const notifications = source('../../lib/notifications.ts');
    expect(history).toContain('Penalty');
    expect(history).not.toContain('>easy<');
    expect(notifications).toContain('complete the penalty');
    expect(notifications).not.toContain('complete the easy version');
  });
});
