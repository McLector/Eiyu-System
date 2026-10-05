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
