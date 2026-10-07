import { describe, expect, it, vi } from 'vitest';
import { CHAIN_DRAG_TYPE, hasChainDrag, hasQuestDrag, QUEST_DRAG_TYPE, readChainDrag, readQuestDrag, writeChainDrag, writeQuestDrag } from '../lane-drag';

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
    ['an unknown lane', JSON.stringify({ id: 'q', from: 'archived' })],
    ['a missing id', JSON.stringify({ from: 'backlog' })],
    ['an id with spaces or markup', JSON.stringify({ id: '<img onerror=x>', from: 'backlog' })],
    ['an id that is not a string', JSON.stringify({ id: 7, from: 'one_time' })],
    ['an enormous id', JSON.stringify({ id: 'a'.repeat(200), from: 'one_time' })],
  ])('ignores %s', (_label, raw) => {
    expect(readQuestDrag(data(raw))).toBeNull();
  });

  it('accepts a Daily habit now that habits can be reordered by their grip', () => {
    expect(readQuestDrag(data(JSON.stringify({ id: 'quest-1', from: 'habit' })))).toEqual({ id: 'quest-1', from: 'habit' });
  });

  it('recognises only our drag type, so a dragged file or text is left alone', () => {
    expect(hasQuestDrag({ types: [QUEST_DRAG_TYPE] })).toBe(true);
    expect(hasQuestDrag({ types: ['Files'] })).toBe(false);
    expect(hasQuestDrag({ types: ['text/plain'] })).toBe(false);
  });
});

describe('chain drag payload', () => {
  const chainData = (value: string) => ({ getData: (type: string) => (type === CHAIN_DRAG_TYPE ? value : '') });

  it('round-trips a chain id on its own drag type, so it is never mistaken for a quest', () => {
    const setData = vi.fn();
    const target = { setData, effectAllowed: 'none' as DataTransfer['effectAllowed'] };
    writeChainDrag(target, 'chain-1');
    expect(setData).toHaveBeenCalledWith(CHAIN_DRAG_TYPE, JSON.stringify({ id: 'chain-1' }));
    expect(target.effectAllowed).toBe('move');
    expect(readChainDrag(chainData(JSON.stringify({ id: 'chain-1' })))).toBe('chain-1');
    expect(hasChainDrag({ types: [CHAIN_DRAG_TYPE] })).toBe(true);
    expect(hasChainDrag({ types: [QUEST_DRAG_TYPE] })).toBe(false);
    expect(hasQuestDrag({ types: [CHAIN_DRAG_TYPE] })).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['not json', '{oops'],
    ['an array', '[1]'],
    ['a missing id', '{}'],
    ['an id with markup', JSON.stringify({ id: '<b>' })],
    ['a non-string id', JSON.stringify({ id: 4 })],
    ['an enormous id', JSON.stringify({ id: 'a'.repeat(200) })],
  ])('ignores %s', (_label, raw) => {
    expect(readChainDrag(chainData(raw))).toBeNull();
  });
});
