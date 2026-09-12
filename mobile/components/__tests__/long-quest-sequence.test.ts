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
});
