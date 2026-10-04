import type { QuestType } from '@eiyu/shared';

/** Our own drag type: a file, a link or selected text dragged over the board is never mistaken for a quest. */
export const QUEST_DRAG_TYPE = 'application/x-eiyu-quest';

export interface QuestDragPayload { id: string; from: QuestType }

// Quest ids are UUIDs; anything else (markup, spaces, huge strings) is not ours.
const ID_PATTERN = /^[\w-]{1,64}$/;

export function writeQuestDrag(data: Pick<DataTransfer, 'setData' | 'effectAllowed'>, payload: QuestDragPayload): void {
  data.setData(QUEST_DRAG_TYPE, JSON.stringify(payload));
  data.effectAllowed = 'move';
}

/** The browser hides the payload while dragging, but always exposes its types. */
export function hasQuestDrag(data: { types?: ArrayLike<string> | readonly string[] }): boolean {
  return Array.from(data.types ?? []).includes(QUEST_DRAG_TYPE);
}

/** Only Backlog and One-time quests are dragged, so any other payload is rejected. */
export function readQuestDrag(data: Pick<DataTransfer, 'getData'>): QuestDragPayload | null {
  try {
    const raw = data.getData(QUEST_DRAG_TYPE);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const { id, from } = value as { id?: unknown; from?: unknown };
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null;
    if (from !== 'backlog' && from !== 'one_time') return null;
    return { id, from };
  } catch {
    return null;
  }
}
