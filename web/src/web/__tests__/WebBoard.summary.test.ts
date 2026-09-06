import { describe, expect, it } from 'vitest';
import { boardSummaryLine } from '../WebBoard';

describe('boardSummaryLine', () => {
  it('says nothing is scheduled when there are no quests at all', () => {
    expect(boardSummaryLine(0, 0)).toBe('No quests scheduled today.');
  });

  it('says the board is quiet when nothing has been completed yet', () => {
    expect(boardSummaryLine(0, 4)).toBe('The board is quiet — no answers yet.');
  });

  it('says the board answered in full when everything scheduled is complete', () => {
    expect(boardSummaryLine(4, 4)).toBe('The board answered in full.');
  });

  it('reports the fraction for a partially-completed day', () => {
    expect(boardSummaryLine(2, 4)).toBe('2 of 4 have answered the call.');
  });
});
