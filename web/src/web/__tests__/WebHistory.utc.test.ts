import { describe, expect, it } from 'vitest';
import { deriveUtcToday } from '../WebHistory';

describe('WebHistory UTC-boundary date derivation', () => {
  it('derives the UTC calendar date, not the local one, at a local/UTC day-boundary moment', () => {
    // 2026-08-29T23:30:00Z is 2026-08-29 in UTC, but 2026-08-30 in a
    // UTC+1 zone and later, and 2026-08-29 (earlier) in negative
    // offsets — the exact class of moment where local Date methods
    // would disagree with the database's UTC-keyed completed_on.
    const boundaryMoment = new Date('2026-08-29T23:30:00.000Z');
    expect(deriveUtcToday(boundaryMoment)).toEqual({ year: 2026, month: 7, day: 29 });
  });

  it('rolls over to the next UTC day exactly at 00:00:00Z, not before', () => {
    const justBeforeMidnightUtc = new Date('2026-08-29T23:59:59.999Z');
    const justAfterMidnightUtc = new Date('2026-08-30T00:00:00.000Z');
    expect(deriveUtcToday(justBeforeMidnightUtc).day).toBe(29);
    expect(deriveUtcToday(justAfterMidnightUtc).day).toBe(30);
  });
});
