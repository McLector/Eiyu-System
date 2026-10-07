import { useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { REORDER_COPY, STAT_COLORS, oneTimeTiming, questGenreLabel, questWhenLabel, type Quest, type ReorderState } from '@eiyu/shared';
import { ArchiveIcon, CheckIcon, ChevronIcon, EditIcon, GripIcon, MoveIcon, SnowflakeIcon, TrashIcon, StatIcon } from '../Icons';
import ActionMenu, { type ActionMenuItem } from '../components/ActionMenu';
import FireStreak from '../FireStreak';
import { hasQuestDrag, readQuestDrag, writeQuestDrag } from './lane-drag';

/** Manual order for a card in a lane the user can reorder. Absent means no controls (finished, or no positions yet). */
export interface QuestCardReorder {
  state: ReorderState;
  onMove: (to: 'top' | 'up' | 'down') => void;
  /** A different card from this lane is being dragged, so this card accepts a drop. */
  dropReady: boolean;
  onDrop: (draggedId: string, half: 'before' | 'after') => void;
}

export interface QuestCardProps {
  quest: Quest;
  /** The account's current date key; lets a One-time card say No date or Upcoming. */
  today?: string;
  pending: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onAdjustProgress: (delta: number) => void;
  onArchive: () => void;
  onDelete: () => void;
  /** One-time and Backlog cards: move to the other lane. */
  onMove?: () => void;
  onDragStart?: (quest: Quest) => void;
  onDragEnd?: () => void;
  reorder?: QuestCardReorder;
}

export default function QuestCard({ quest, today, pending, onToggle, onOpen, onEdit, onAdjustProgress, onArchive, onDelete, onMove, onDragStart, onDragEnd, reorder }: QuestCardProps) {
  const [popping, setPopping] = useState(false);
  const [hover, setHover] = useState<'before' | 'after' | null>(null);
  const isBacklog = quest.questType === 'backlog';
  const isOneTime = quest.questType === 'one_time';
  const orderable = !!reorder && !quest.completed;
  const draggable = !!onDragStart && (orderable || isBacklog || (isOneTime && !quest.completed));
  const genre = isBacklog || isOneTime ? questGenreLabel(quest.genre) : null;
  const label = quest.completed ? 'Undo' : 'Complete';

  const moves: ActionMenuItem[] = reorder && orderable ? [
    { label: REORDER_COPY.moveTop, ariaLabel: REORDER_COPY.moveTopFor(quest.name), onSelect: () => reorder.onMove('top'), disabled: !reorder.state.canMoveUp, icon: <ChevronIcon direction="up" />, tone: 'edit' },
    { label: REORDER_COPY.moveUp, ariaLabel: REORDER_COPY.moveUpFor(quest.name), onSelect: () => reorder.onMove('up'), disabled: !reorder.state.canMoveUp, icon: <ChevronIcon direction="up" />, tone: 'edit' },
    { label: REORDER_COPY.moveDown, ariaLabel: REORDER_COPY.moveDownFor(quest.name), onSelect: () => reorder.onMove('down'), disabled: !reorder.state.canMoveDown, icon: <ChevronIcon direction="down" />, tone: 'edit' },
  ] : [];

  const items: ActionMenuItem[] = [
    { label: 'Edit Quest', ariaLabel: `Edit ${quest.name}`, onSelect: onEdit, icon: <EditIcon />, tone: 'edit' },
    ...moves,
    ...(isBacklog && onMove ? [{ label: 'Move to One-time', ariaLabel: `Move ${quest.name} to One-time`, onSelect: onMove, icon: <MoveIcon direction="left" />, tone: 'edit' as const }] : []),
    ...(isOneTime && onMove && !quest.completed ? [{ label: 'Move to Backlog', ariaLabel: `Move ${quest.name} to Backlog`, onSelect: onMove, icon: <MoveIcon />, tone: 'edit' as const }] : []),
    ...(!isBacklog ? [{ label: 'Archive', ariaLabel: `Archive ${quest.name}`, onSelect: onArchive, icon: <ArchiveIcon />, tone: 'warn' as const }] : []),
    { label: 'Delete', ariaLabel: `Delete ${quest.name}`, onSelect: onDelete, icon: <TrashIcon />, danger: true, tone: 'danger' },
  ];

  let primary: ReactNode = null;
  if (!isBacklog) {
    primary = quest.targetCount == null ? (
      <button
        type="button"
        className={`btn-secondary btn-compact quest-complete${quest.completed ? ' is-complete' : ''}${popping ? ' is-popping' : ''}`}
        onClick={() => { if (!quest.completed) setPopping(true); onToggle(); }}
        onAnimationEnd={() => setPopping(false)}
        aria-label={`${label} ${quest.name}`}
        aria-pressed={quest.completed}
      >
        <CheckIcon />
      </button>
    ) : (
      <div className="board-progress-stepper" aria-label={`${quest.name} progress`}>
        <button type="button" className="btn-secondary btn-compact" aria-label={`Decrease progress for ${quest.name}`} onClick={() => onAdjustProgress(-1)} disabled={quest.progressCount <= 0}>−</button>
        <span>{quest.progressCount}/{quest.targetCount}</span>
        <button type="button" className="btn-secondary btn-compact" aria-label={`Increase progress for ${quest.name}`} onClick={() => onAdjustProgress(1)} disabled={quest.progressCount >= quest.targetCount}>+</button>
      </div>
    );
  }

  // The top half of a card means "before it", the bottom half "after it".
  const halfOf = (event: DragEvent<HTMLElement>): 'before' | 'after' => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  };
  const dropTarget = reorder && orderable && reorder.dropReady ? {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!hasQuestDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setHover(halfOf(event));
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHover(null);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      setHover(null);
      const payload = readQuestDrag(event.dataTransfer);
      if (!payload || payload.from !== quest.questType || payload.id === quest.id) return;
      event.preventDefault();
      event.stopPropagation();
      reorder.onDrop(payload.id, halfOf(event));
    },
  } : {};

  return (
    <article
      className={`quest-card${isBacklog ? ' is-backlog' : ''}${draggable ? ' has-grip' : ''}${hover === 'before' ? ' is-reorder-before' : hover === 'after' ? ' is-reorder-after' : ''}`}
      data-testid={`quest-card-${quest.id}`}
      style={{ '--quest-stat': STAT_COLORS[quest.stat] } as CSSProperties}
      {...dropTarget}
    >
      {draggable && (
        <span
          className="quest-card-grip"
          draggable
          aria-hidden="true"
          onDragStart={event => {
            writeQuestDrag(event.dataTransfer, { id: quest.id, from: quest.questType });
            const card = event.currentTarget.closest('.quest-card');
            if (card) event.dataTransfer.setDragImage?.(card, 16, 16);
            onDragStart?.(quest);
          }}
          onDragEnd={() => onDragEnd?.()}
        >
          <GripIcon />
        </span>
      )}
      <button type="button" className="quest-card-open" aria-label={`View ${quest.name} details`} title={quest.name} onClick={onOpen}>
        <span className="quest-card-title">{quest.name}</span>
        <span className="quest-card-meta">
          <span className="quest-chip is-stat"><StatIcon stat={quest.stat} size={11} /> {quest.stat}</span>
          <span className={`quest-card-when${isOneTime && oneTimeTiming(quest, today) === 'upcoming' ? ' is-upcoming' : ''}`}>{questWhenLabel(quest, today)}</span>
          {quest.streak > 0 && <span className="board-card-streak"><FireStreak size={11} /> {quest.streak}</span>}
          {quest.frozen && <SnowflakeIcon size={12} />}
          {genre && <span className="quest-chip">{genre}</span>}
        </span>
      </button>
      <div className="quest-card-controls">
        {primary}
        <ActionMenu label={`More actions for ${quest.name}`} disabled={pending} busy={pending} items={items} />
      </div>
    </article>
  );
}
