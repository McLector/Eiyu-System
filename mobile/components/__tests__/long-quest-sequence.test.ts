import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mobile Long Quest sequence contract', () => {
  it('disables locked stages and explains why', () => {
    const source = readFileSync(resolve(__dirname, '../../app/(tabs)/longquests.tsx'), 'utf8');
    expect(source).toContain('stageSequenceState');
    expect(source).toContain('disabled={sequence.locked}');
    expect(source).toContain('LOCKED');
    expect(source).toContain('Complete earlier stages first.');
  });

  it('restores the exact optimistic snapshot and reloads authoritative state', () => {
    const source = readFileSync(resolve(__dirname, '../../contexts/eiyu-store.tsx'), 'utf8');
    expect(source).toContain('const previous = qc.getQueryData<LongQuest[]>(key)');
    expect(source).toContain('qc.setQueryData<LongQuest[]>(key, previous)');
    expect(source).toContain('await qc.invalidateQueries({ queryKey: key })');
  });

  it('supports optional, bounded, multiline stage descriptions without truncating their display', () => {
    const editor = readFileSync(resolve(__dirname, '../../app/long-quest-editor.tsx'), 'utf8');
    const list = readFileSync(resolve(__dirname, '../../app/(tabs)/longquests.tsx'), 'utf8');
    expect(editor).toContain('setStageDescriptionAt');
    expect(editor).toContain('STAGE_DESCRIPTION_MAX_LENGTH');
    expect(editor).toContain('Stage description (optional)');
    expect(editor).toContain('multiline');
    expect(list).not.toMatch(/numberOfLines=\{1\}[\s\S]{0,120}styles\.stageDescription/);
  });
});
