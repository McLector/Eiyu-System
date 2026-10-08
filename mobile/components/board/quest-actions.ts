import { REORDER_COPY, type Quest, type ReorderState } from '@eiyu/shared';

export type QuestActionKey = 'details' | 'edit' | 'move-top' | 'move-up' | 'move-down' | 'move-to-one-time' | 'move-to-backlog' | 'archive' | 'delete';

export interface QuestAction {
  key: QuestActionKey;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * What a quest offers in its action sheet, matching the web card's menu. A finished one-time quest cannot go back to
 * Backlog (the server refuses it), and a Backlog quest cannot be archived.
 */
export function questActions(quest: Quest, order?: ReorderState | null): QuestAction[] {
  const isBacklog = quest.questType === 'backlog';
  const isOneTime = quest.questType === 'one_time';
  // Manual order: only an unfinished quest in a lane that has one can be moved within it.
  const moves: QuestAction[] = order && !quest.completed ? [
    { key: 'move-top', label: REORDER_COPY.moveTop, disabled: !order.canMoveUp },
    { key: 'move-up', label: REORDER_COPY.moveUp, disabled: !order.canMoveUp },
    { key: 'move-down', label: REORDER_COPY.moveDown, disabled: !order.canMoveDown },
  ] : [];
  return [
    { key: 'details', label: 'Details' },
    { key: 'edit', label: 'Edit quest' },
    ...moves,
    ...(isBacklog ? [{ key: 'move-to-one-time' as const, label: 'Move to 1-Time' }] : []),
    ...(isOneTime && !quest.completed ? [{ key: 'move-to-backlog' as const, label: 'Move to Backlog' }] : []),
    ...(!isBacklog ? [{ key: 'archive' as const, label: 'Archive' }] : []),
    { key: 'delete', label: 'Delete permanently', destructive: true },
  ];
}
