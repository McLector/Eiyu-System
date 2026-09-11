import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(relativePath: string) {
  return readFileSync(resolve(__dirname, relativePath), 'utf8');
}

describe('Penalty terminology on active web surfaces', () => {
  it('uses Penalty in the habit editor and suggestion action', () => {
    const editor = source('../web/WebQuestEditor.tsx');
    expect(editor).toContain('PENALTY');
    expect(editor).toContain('SUGGEST PENALTIES');
    expect(editor).not.toContain('EASY VERSION');
    expect(editor).not.toContain('SUGGEST EASY VERSIONS');
  });

  it('uses Penalty on recovery cards and completion history', () => {
    const board = source('../web/WebBoard.tsx');
    const history = source('../web/WebHistory.tsx');
    expect(board).toContain('Penalty:');
    expect(board).not.toContain('Easy version:');
    expect(history).toContain('Penalty');
    expect(history).not.toContain('Partial / easy');
  });
});
