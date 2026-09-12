import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('web Long Quest sequence contract', () => {
  it('disables locked stages and exposes an accessible explanation', () => {
    const source = readFileSync(resolve(__dirname, '../web/WebLongQuests.tsx'), 'utf8');
    expect(source).toContain('stageSequenceState');
    expect(source).toContain('disabled={sequence.locked}');
    expect(source).toContain('aria-label');
    expect(source).toContain('LOCKED');
    expect(source).toContain('Complete earlier stages first.');
  });

  it('restores the exact optimistic snapshot and reloads authoritative state', () => {
    const source = readFileSync(resolve(__dirname, '../store/eiyu-store.tsx'), 'utf8');
    expect(source).toContain('const previous = qc.getQueryData<LongQuest[]>(key)');
    expect(source).toContain('qc.setQueryData<LongQuest[]>(key, previous)');
    expect(source).toContain('await qc.invalidateQueries({ queryKey: key })');
  });

  it('supports optional bounded stage-description editing and readable inert display text', () => {
    const source = readFileSync(resolve(__dirname, '../web/WebLongQuests.tsx'), 'utf8');
    expect(source).toContain('STAGE_DESCRIPTION_MAX_LENGTH');
    expect(source).toContain('setEditStageDescriptionAt');
    expect(source).toContain('newStageDescriptions');
    expect(source).toContain('Stage description (optional)');
    expect(source).toContain("whiteSpace: 'pre-wrap'");
    expect(source).toContain("overflowWrap: 'anywhere'");
    expect(source).not.toContain('dangerouslySetInnerHTML');
  });
});
