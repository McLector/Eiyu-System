import { describe, expect, it, vi } from 'vitest';
import { hasQuestDrag, QUEST_DRAG_TYPE, readQuestDrag, writeQuestDrag } from '../lane-drag';

const data = (value: string) => ({ getData: (type: string) => (type === QUEST_DRAG_TYPE ? value : '') });

describe('quest drag payload', () => {
  it('round-trips a valid payload and marks the move effect', () => {
    const setData = vi.fn();
    const target = { setData, effectAllowed: 'none' as DataTransfer['effectAllowed'] };
    writeQuestDrag(target, { id: 'quest-1', from: 'backlog' });
    expect(setData).toHaveBeenCalledWith(QUEST_DRAG_TYPE, JSON.stringify({ id: 'quest-1', from: 'backlog' }));
    expect(target.effectAllowed).toBe('move');
    expect(readQuestDrag(data(JSON.stringify({ id: 'quest-1', from: 'backlog' })))).toEqual({ id: 'quest-1', from: 'backlog' });
  });

  it.each([
    ['empty', ''],
    ['not json', '{oops'],
    ['an array', '[1,2]'],
    ['a habit (habits are never dragged)', JSON.stringify({ id: 'q', from: 'habit' })],
    ['a missing id', JSON.stringify({ from: 'backlog' })],
    ['an id with spaces or markup', JSON.stringify({ id: '<img onerror=x>', from: 'backlog' })],
    ['an id that is not a string', JSON.stringify({ id: 7, from: 'one_time' })],
    ['an enormous id', JSON.stringify({ id: 'a'.repeat(200), from: 'one_time' })],
  ])('ignores %s', (_label, raw) => {
    expect(readQuestDrag(data(raw))).toBeNull();
  });

  it('recognises only our drag type, so a dragged file or text is left alone', () => {
    expect(hasQuestDrag({ types: [QUEST_DRAG_TYPE] })).toBe(true);
    expect(hasQuestDrag({ types: ['Files'] })).toBe(false);
    expect(hasQuestDrag({ types: ['text/plain'] })).toBe(false);
  });
});
