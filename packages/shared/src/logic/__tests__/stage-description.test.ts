import { STAGE_DESCRIPTION_MAX_LENGTH, normalizeStageDescription } from '../stage-description';

describe('normalizeStageDescription', () => {
  it('keeps old omitted payloads valid and normalizes blank text to null', () => {
    expect(normalizeStageDescription()).toBeNull();
    expect(normalizeStageDescription(null)).toBeNull();
    expect(normalizeStageDescription(' \n\t ')).toBeNull();
  });

  it('trims outer whitespace while preserving multiline Unicode content', () => {
    expect(normalizeStageDescription('  First line\n勇者 ✨\n  ')).toBe('First line\n勇者 ✨');
  });

  it('accepts the limit and rejects content beyond it', () => {
    expect(STAGE_DESCRIPTION_MAX_LENGTH).toBe(2000);
    expect(normalizeStageDescription('a'.repeat(STAGE_DESCRIPTION_MAX_LENGTH))).toHaveLength(
      STAGE_DESCRIPTION_MAX_LENGTH
    );
    expect(() => normalizeStageDescription('a'.repeat(STAGE_DESCRIPTION_MAX_LENGTH + 1))).toThrow(
      `Stage descriptions must be ${STAGE_DESCRIPTION_MAX_LENGTH} characters or fewer.`
    );
  });

  it('counts Unicode code points consistently with the PostgreSQL boundary', () => {
    expect(normalizeStageDescription('🧭'.repeat(STAGE_DESCRIPTION_MAX_LENGTH))).toBe(
      '🧭'.repeat(STAGE_DESCRIPTION_MAX_LENGTH)
    );
    expect(() => normalizeStageDescription('🧭'.repeat(STAGE_DESCRIPTION_MAX_LENGTH + 1))).toThrow(
      `Stage descriptions must be ${STAGE_DESCRIPTION_MAX_LENGTH} characters or fewer.`
    );
  });

  it('preserves markup-like content as text data', () => {
    expect(normalizeStageDescription('<script>alert("no")</script>')).toBe('<script>alert("no")</script>');
  });
});
