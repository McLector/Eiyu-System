import { describe, expect, it } from 'vitest';
import { deriveAccountToday } from '../WebHistory';

describe('WebHistory account-timezone date derivation', () => {
  it('derives the persisted account calendar date at a UTC boundary', () => {
    const boundaryMoment = new Date('2026-08-29T23:30:00.000Z');
    expect(deriveAccountToday(boundaryMoment, 'Asia/Manila')).toEqual({ year: 2026, month: 7, day: 30 });
  });

  it('rolls over exactly at midnight in the persisted zone', () => {
    const justBeforeManilaMidnight = new Date('2026-08-29T15:59:59.999Z');
    const justAfterManilaMidnight = new Date('2026-08-29T16:00:00.000Z');
    expect(deriveAccountToday(justBeforeManilaMidnight, 'Asia/Manila').day).toBe(29);
    expect(deriveAccountToday(justAfterManilaMidnight, 'Asia/Manila').day).toBe(30);
  });
});
