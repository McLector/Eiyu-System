import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(relativePath: string) {
  return readFileSync(resolve(__dirname, relativePath), 'utf8');
}

describe('Penalty terminology on active mobile surfaces', () => {
  it('uses Penalty in the habit editor and suggestion action', () => {
    const editor = source('../../app/quest-editor.tsx');
    expect(editor).toContain('PENALTY');
    expect(editor).toContain('SUGGEST PENALTIES');
    expect(editor).not.toContain('EASY VERSION');
    expect(editor).not.toContain('SUGGEST EASY VERSIONS');
  });

  it('uses Penalty on board recovery copy and accessible actions', () => {
    const board = source('../../app/(tabs)/board.tsx');
    expect(board).toContain('Penalty:');
    expect(board).toContain('Complete penalty');
    expect(board).not.toContain('Easy version:');
    expect(board).not.toContain('Complete easy version');
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
