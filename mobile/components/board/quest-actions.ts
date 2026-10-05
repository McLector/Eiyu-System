import type { Quest } from '@eiyu/shared';

export type QuestActionKey = 'details' | 'edit' | 'move-to-one-time' | 'move-to-backlog' | 'archive' | 'delete';

export interface QuestAction {
  key: QuestActionKey;
  label: string;
  destructive?: boolean;
}

/**
 * What a quest offers in its action sheet, matching the web card's menu. A finished one-time quest cannot go back to
 * Backlog (the server refuses it), and a Backlog quest cannot be archived.
 */
export function questActions(quest: Quest): QuestAction[] {
  const isBacklog = quest.questType === 'backlog';
  const isOneTime = quest.questType === 'one_time';
  return [
    { key: 'details', label: 'Details' },
    { key: 'edit', label: 'Edit quest' },
    ...(isBacklog ? [{ key: 'move-to-one-time' as const, label: 'Move to One-time' }] : []),
    ...(isOneTime && !quest.completed ? [{ key: 'move-to-backlog' as const, label: 'Move to Backlog' }] : []),
    ...(!isBacklog ? [{ key: 'archive' as const, label: 'Archive' }] : []),
    { key: 'delete', label: 'Delete permanently', destructive: true },
  ];
}
