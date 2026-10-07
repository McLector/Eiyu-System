import {
  REORDER_COPY,
  applyManualOrder,
  byPosition,
  hasManualOrder,
  isChainFinished,
  moveId,
  reorderState,
  sortChains,
} from '../manual-order';
import { LongQuest } from '../../types/eiyu';

const row = (id: string, position?: number) => ({ id, position });

describe('hasManualOrder', () => {
  it('is true only when every row carries a position', () => {
    expect(hasManualOrder([row('a', 0), row('b', 1)])).toBe(true);
    expect(hasManualOrder([row('a', 0), row('b')])).toBe(false);
    expect(hasManualOrder([row('a'), row('b')])).toBe(false);
  });

  it('is false for an empty list, so no controls show without rows to move', () => {
    expect(hasManualOrder([])).toBe(false);
  });

  it('accepts negative positions, which new quests get at the top', () => {
    expect(hasManualOrder([row('a', -3), row('b', 0)])).toBe(true);
  });

  it('rejects a non-numeric position', () => {
    expect(hasManualOrder([{ id: 'a', position: null as unknown as number }])).toBe(false);
    expect(hasManualOrder([{ id: 'a', position: NaN }])).toBe(false);
  });
});

describe('byPosition', () => {
  it('sorts by position and breaks ties by id, without mutating the input', () => {
    const input = [row('c', 1), row('b', 1), row('a', 2), row('z', -1)];
    expect(byPosition(input).map(r => r.id)).toEqual(['z', 'b', 'c', 'a']);
    expect(input.map(r => r.id)).toEqual(['c', 'b', 'a', 'z']);
  });
});

describe('moveId', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('moves to the top', () => {
    expect(moveId(ids, 'c', 'top')).toEqual(['c', 'a', 'b', 'd']);
  });

  it('moves one step up and down', () => {
    expect(moveId(ids, 'c', 'up')).toEqual(['a', 'c', 'b', 'd']);
    expect(moveId(ids, 'b', 'down')).toEqual(['a', 'c', 'b', 'd']);
  });

  it('leaves the list alone at the ends', () => {
    expect(moveId(ids, 'a', 'top')).toEqual(ids);
    expect(moveId(ids, 'a', 'up')).toEqual(ids);
    expect(moveId(ids, 'd', 'down')).toEqual(ids);
  });

  it('places before or after another row (a drop)', () => {
    expect(moveId(ids, 'd', { before: 'b' })).toEqual(['a', 'd', 'b', 'c']);
    expect(moveId(ids, 'a', { after: 'c' })).toEqual(['b', 'c', 'a', 'd']);
    expect(moveId(ids, 'a', { after: 'd' })).toEqual(['b', 'c', 'd', 'a']);
    expect(moveId(ids, 'd', { before: 'a' })).toEqual(['d', 'a', 'b', 'c']);
  });

  it('ignores a drop on itself, an unknown id or an unknown target', () => {
    expect(moveId(ids, 'b', { before: 'b' })).toEqual(ids);
    expect(moveId(ids, 'b', { after: 'b' })).toEqual(ids);
    expect(moveId(ids, 'nope', 'top')).toEqual(ids);
    expect(moveId(ids, 'b', { before: 'nope' })).toEqual(ids);
  });

  it('never mutates its input and always returns a copy', () => {
    const input = ['a', 'b'];
    const result = moveId(input, 'b', 'top');
    expect(input).toEqual(['a', 'b']);
    expect(moveId(input, 'a', 'top')).not.toBe(input);
    expect(result).toEqual(['b', 'a']);
  });

  it('moves a single item in a one-item list to nowhere', () => {
    expect(moveId(['a'], 'a', 'down')).toEqual(['a']);
  });
});

describe('reorderState', () => {
  it('reports the position among the movable ids and which moves are possible', () => {
    expect(reorderState(['a', 'b', 'c'], 'a')).toEqual({ index: 0, count: 3, canMoveUp: false, canMoveDown: true });
    expect(reorderState(['a', 'b', 'c'], 'b')).toEqual({ index: 1, count: 3, canMoveUp: true, canMoveDown: true });
    expect(reorderState(['a', 'b', 'c'], 'c')).toEqual({ index: 2, count: 3, canMoveUp: true, canMoveDown: false });
  });

  it('allows nothing for a lone row', () => {
    expect(reorderState(['a'], 'a')).toEqual({ index: 0, count: 1, canMoveUp: false, canMoveDown: false });
  });

  it('is null for a row that is not movable (finished or unknown)', () => {
    expect(reorderState(['a', 'b'], 'done')).toBeNull();
  });
});

describe('applyManualOrder (the optimistic mirror of the server)', () => {
  it('puts a full list in the given order and renumbers from 0', () => {
    const rows = [row('a', 0), row('b', 1), row('c', 2)];
    const next = applyManualOrder(rows, ['c', 'a', 'b']);
    expect(next.map(r => [r.id, r.position])).toEqual([['c', 0], ['a', 1], ['b', 2]]);
  });

  it('lets a hidden row keep its slot when only some rows are given', () => {
    const rows = [row('w', 0), row('x', 1), row('y', 2), row('z', 3)];
    const next = applyManualOrder(rows, ['z', 'x']);
    expect(next.map(r => r.id)).toEqual(['w', 'z', 'y', 'x']);
    expect(next.map(r => r.position)).toEqual([0, 1, 2, 3]);
  });

  it('works from unsorted input and negative positions', () => {
    const rows = [row('b', 5), row('a', -2), row('c', 9)];
    expect(applyManualOrder(rows, ['c', 'b']).map(r => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('settles tied positions deterministically', () => {
    const rows = [row('b', 0), row('a', 0), row('c', 0)];
    expect(applyManualOrder(rows, ['c', 'b', 'a']).map(r => [r.id, r.position])).toEqual([['c', 0], ['b', 1], ['a', 2]]);
  });

  it('keeps every other field and does not mutate the input', () => {
    const rows = [{ id: 'a', position: 0, name: 'A' }, { id: 'b', position: 1, name: 'B' }];
    const next = applyManualOrder(rows, ['b', 'a']);
    expect(next.map(r => r.name)).toEqual(['B', 'A']);
    expect(rows.map(r => r.position)).toEqual([0, 1]);
  });

  it('ignores ids that are not in the list, and an empty or duplicate-free no-op', () => {
    const rows = [row('a', 0), row('b', 1)];
    expect(applyManualOrder(rows, ['ghost', 'b', 'a']).map(r => r.id)).toEqual(['b', 'a']);
    expect(applyManualOrder(rows, []).map(r => r.id)).toEqual(['a', 'b']);
  });

  it('returns the rows untouched when any row has no position yet', () => {
    const rows = [row('a', 0), row('b')];
    expect(applyManualOrder(rows, ['b', 'a'])).toEqual(rows);
  });
});

describe('isChainFinished and sortChains', () => {
  const chain = (id: string, done: boolean[], position?: number): LongQuest => ({
    id, name: id, stat: 'INT', description: null, completedAt: null, position,
    stages: done.map((d, i) => ({ id: `${id}-${i}`, name: `s${i}`, done: d, description: null })),
  });

  it('counts a chain as finished only when it has stages and all are done', () => {
    expect(isChainFinished(chain('a', [true, true]))).toBe(true);
    expect(isChainFinished(chain('a', [true, false]))).toBe(false);
    expect(isChainFinished(chain('a', []))).toBe(false);
  });

  it('sorts by position and lets finished chains sink', () => {
    const list = [chain('done-first', [true], 0), chain('b', [false], 2), chain('a', [false], 1)];
    expect(sortChains(list).map(c => c.id)).toEqual(['a', 'b', 'done-first']);
  });

  it('keeps the manual order among the finished ones', () => {
    const list = [chain('f2', [true], 3), chain('f1', [true], 1), chain('u', [false], 5)];
    expect(sortChains(list).map(c => c.id)).toEqual(['u', 'f1', 'f2']);
  });

  it('reads an undone stage again as unfinished, so the chain rises', () => {
    expect(sortChains([chain('a', [true, false], 0), chain('b', [true], 1)]).map(c => c.id)).toEqual(['a', 'b']);
  });

  it('keeps the fetched order, finished or not, until positions arrive', () => {
    const list = [chain('old', [true]), chain('mid', [false]), chain('new', [false])];
    expect(sortChains(list).map(c => c.id)).toEqual(['old', 'mid', 'new']);
  });

  it('does not mutate its input', () => {
    const list = [chain('b', [false], 1), chain('a', [false], 0)];
    sortChains(list);
    expect(list.map(c => c.id)).toEqual(['b', 'a']);
  });
});

describe('REORDER_COPY', () => {
  it('names the three moves the same on every platform', () => {
    expect(REORDER_COPY.moveTop).toBe('Move to top');
    expect(REORDER_COPY.moveUp).toBe('Move up');
    expect(REORDER_COPY.moveDown).toBe('Move down');
  });

  it('labels the grip and the actions with the item name', () => {
    expect(REORDER_COPY.grip('Read')).toBe('Reorder Read');
    expect(REORDER_COPY.moveTopFor('Read')).toBe('Move Read to top');
    expect(REORDER_COPY.moveUpFor('Read')).toBe('Move Read up');
    expect(REORDER_COPY.moveDownFor('Read')).toBe('Move Read down');
  });
});
