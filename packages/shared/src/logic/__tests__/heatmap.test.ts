import { heatmapCellState } from '../heatmap';

const TODAY = '2026-09-05';

describe('heatmapCellState', () => {
  it('marks any date after today as future, regardless of counts', () => {
    const state = heatmapCellState('2026-09-06', TODAY, { completedCount: 4, scheduledCount: 4 });
    expect(state.isFuture).toBe(true);
    expect(state.isStar).toBe(false);
  });

  it('is a star when completedCount equals a positive scheduledCount and the date is not future', () => {
    const state = heatmapCellState('2026-09-01', TODAY, { completedCount: 4, scheduledCount: 4 });
    expect(state.isFuture).toBe(false);
    expect(state.isStar).toBe(true);
    expect(state.ratio).toBe(1);
  });

  it('is never a star when scheduledCount is 0, even if completedCount is also 0', () => {
    const state = heatmapCellState('2026-09-01', TODAY, { completedCount: 0, scheduledCount: 0 });
    expect(state.isStar).toBe(false);
    expect(state.ratio).toBe(0);
  });

  it('computes a partial ratio for a non-perfect day', () => {
    const state = heatmapCellState('2026-09-01', TODAY, { completedCount: 1, scheduledCount: 4 });
    expect(state.isStar).toBe(false);
    expect(state.ratio).toBe(0.25);
  });

  it('treats undefined counts (no data loaded yet for this date) as scheduledCount 0', () => {
    const state = heatmapCellState('2026-09-01', TODAY, undefined);
    expect(state.isFuture).toBe(false);
    expect(state.isStar).toBe(false);
    expect(state.ratio).toBe(0);
  });

  it('today itself is not future', () => {
    const state = heatmapCellState(TODAY, TODAY, { completedCount: 0, scheduledCount: 3 });
    expect(state.isFuture).toBe(false);
  });
});
