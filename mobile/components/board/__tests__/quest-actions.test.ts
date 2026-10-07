import type { Quest } from '@eiyu/shared';

import { questActions } from '../quest-actions';

function quest(overrides: Partial<Quest>): Quest {
  return {
    id: 'q', name: 'Quest', stat: 'STR', difficulty: 'Easy', easyVersion: null, description: null, questType: 'habit',
    archived: false, time: '08:00', days: [1], streak: 0, frozen: false, completed: false, targetCount: null, progressCount: 0,
    ...overrides,
  } as Quest;
}
const keys = (q: Quest) => questActions(q).map(a => a.key);

describe('questActions', () => {
  it('offers a habit details, edit, archive and delete', () => {
    expect(keys(quest({ questType: 'habit' }))).toEqual(['details', 'edit', 'archive', 'delete']);
  });

  it('offers an unfinished one-time quest a move to Backlog as well', () => {
    expect(keys(quest({ questType: 'one_time' }))).toEqual(['details', 'edit', 'move-to-backlog', 'archive', 'delete']);
  });

  it('does not offer a finished one-time quest a move to Backlog (the server would refuse it)', () => {
    expect(keys(quest({ questType: 'one_time', completed: true }))).toEqual(['details', 'edit', 'archive', 'delete']);
  });

  it('offers a Backlog quest a move to One-time and no archive', () => {
    expect(keys(quest({ questType: 'backlog' }))).toEqual(['details', 'edit', 'move-to-one-time', 'delete']);
  });

  it('words the actions the way the web menu does, with the destructive one marked', () => {
    const actions = questActions(quest({ questType: 'one_time' }));
    expect(actions.map(a => a.label)).toEqual(['Details', 'Edit quest', 'Move to Backlog', 'Archive', 'Delete permanently']);
    expect(actions.filter(a => a.destructive).map(a => a.key)).toEqual(['delete']);
  });

  it('never repeats an action', () => {
    for (const questType of ['habit', 'one_time', 'backlog'] as const) {
      const list = keys(quest({ questType }));
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

describe('questActions manual order', () => {
  const order = (index: number, count: number) => ({ index, count, canMoveUp: index > 0, canMoveDown: index < count - 1 });
  const withOrder = (q: Quest, o: ReturnType<typeof order> | null) => questActions(q, o);

  it('adds Move to top, up and down right after Edit quest', () => {
    const actions = withOrder(quest({ questType: 'habit' }), order(1, 3));
    expect(actions.map(a => a.key)).toEqual(['details', 'edit', 'move-top', 'move-up', 'move-down', 'archive', 'delete']);
    expect(actions.filter(a => a.key.startsWith('move-')).map(a => a.label)).toEqual(['Move to top', 'Move up', 'Move down']);
  });

  it('keeps the lane moves after the reorder moves', () => {
    expect(withOrder(quest({ questType: 'backlog' }), order(0, 2)).map(a => a.key))
      .toEqual(['details', 'edit', 'move-top', 'move-up', 'move-down', 'move-to-one-time', 'delete']);
    expect(withOrder(quest({ questType: 'one_time' }), order(0, 2)).map(a => a.key))
      .toEqual(['details', 'edit', 'move-top', 'move-up', 'move-down', 'move-to-backlog', 'archive', 'delete']);
  });

  it('disables the moves that go nowhere', () => {
    const first = withOrder(quest({}), order(0, 3));
    expect(first.find(a => a.key === 'move-top')?.disabled).toBe(true);
    expect(first.find(a => a.key === 'move-up')?.disabled).toBe(true);
    expect(first.find(a => a.key === 'move-down')?.disabled).toBe(false);
    const last = withOrder(quest({}), order(2, 3));
    expect(last.find(a => a.key === 'move-down')?.disabled).toBe(true);
    expect(last.find(a => a.key === 'move-top')?.disabled).toBe(false);
  });

  it('adds nothing without an order, or for a finished quest', () => {
    expect(withOrder(quest({}), null).map(a => a.key)).toEqual(['details', 'edit', 'archive', 'delete']);
    expect(questActions(quest({})).map(a => a.key)).toEqual(['details', 'edit', 'archive', 'delete']);
    expect(withOrder(quest({ completed: true }), order(0, 2)).map(a => a.key)).toEqual(['details', 'edit', 'archive', 'delete']);
  });

  it('never repeats an action', () => {
    const list = withOrder(quest({ questType: 'one_time' }), order(1, 3)).map(a => a.key);
    expect(new Set(list).size).toBe(list.length);
  });
});
