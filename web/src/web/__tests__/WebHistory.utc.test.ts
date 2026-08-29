import { describe, expect, it } from 'vitest';
import { toDateKey } from '@eiyu/shared';

// This isolates the exact derivation WebHistory.tsx uses, rather than
// mounting the full component — the bug is in date arithmetic, not
// rendering, so a pure-function test of the same derivation is the
// right level (mounting would need a Supabase-backed useQuery mock
// for no additional coverage of the thing that was actually wrong).
function deriveTodayFromUtc(date: Date): { year: number; month: number; day: number } {
  const [year, month, day] = toDateKey(date).split('-').map(Number);
  return { year, month: month - 1, day };
}

describe('WebHistory UTC-boundary date derivation', () => {
  it('derives the UTC calendar date, not the local one, at a local/UTC day-boundary moment', () => {
    // 2026-08-29T23:30:00Z is 2026-08-29 in UTC, but 2026-08-30 in a
    // UTC+1 zone and later, and 2026-08-29 (earlier) in negative
    // offsets — the exact class of moment where local Date methods
    // would disagree with the database's UTC-keyed completed_on.
    const boundaryMoment = new Date('2026-08-29T23:30:00.000Z');
    expect(deriveTodayFromUtc(boundaryMoment)).toEqual({ year: 2026, month: 7, day: 29 });
  });

  it('rolls over to the next UTC day exactly at 00:00:00Z, not before', () => {
    const justBeforeMidnightUtc = new Date('2026-08-29T23:59:59.999Z');
    const justAfterMidnightUtc = new Date('2026-08-30T00:00:00.000Z');
    expect(deriveTodayFromUtc(justBeforeMidnightUtc).day).toBe(29);
    expect(deriveTodayFromUtc(justAfterMidnightUtc).day).toBe(30);
  });
});
