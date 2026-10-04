import { useState, type CSSProperties, type ReactNode } from 'react';
import { DAYS, STAT_COLORS, questGenreLabel, type Quest } from '@eiyu/shared';
import { ArchiveIcon, CheckIcon, EditIcon, GripIcon, MoveIcon, SnowflakeIcon, TrashIcon, StatIcon } from '../Icons';
import ActionMenu, { type ActionMenuItem } from '../components/ActionMenu';
import FireStreak from '../FireStreak';
import { writeQuestDrag } from './lane-drag';

export interface QuestCardProps {
  quest: Quest;
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
}

function whenLabel(quest: Quest): string {
  if (quest.questType === 'backlog') return 'No date';
  if (quest.questType === 'one_time') return quest.timeSet === false ? 'Today' : `Today ${quest.time}`;
  const days = quest.days.length === 7 ? 'Every day' : quest.days.map(day => DAYS[day]).join(', ');
  return `${days} ${quest.time}`;
}

export default function QuestCard({ quest, pending, onToggle, onOpen, onEdit, onAdjustProgress, onArchive, onDelete, onMove, onDragStart, onDragEnd }: QuestCardProps) {
  const [popping, setPopping] = useState(false);
  const isBacklog = quest.questType === 'backlog';
  const isOneTime = quest.questType === 'one_time';
  const draggable = !!onDragStart && (isBacklog || (isOneTime && !quest.completed));
  const genre = isBacklog || isOneTime ? questGenreLabel(quest.genre) : null;
  const label = quest.completed ? 'Undo' : 'Complete';

  const items: ActionMenuItem[] = [
    { label: 'Edit Quest', ariaLabel: `Edit ${quest.name}`, onSelect: onEdit, icon: <EditIcon />, tone: 'edit' },
    ...(isBacklog && onMove ? [{ label: 'Move to One-time', ariaLabel: `Move ${quest.name} to One-time`, onSelect: onMove, icon: <MoveIcon />, tone: 'edit' as const }] : []),
    ...(isOneTime && onMove && !quest.completed ? [{ label: 'Move to Backlog', ariaLabel: `Move ${quest.name} to Backlog`, onSelect: onMove, icon: <MoveIcon direction="left" />, tone: 'edit' as const }] : []),
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

  return (
    <article
      className={`quest-card${isBacklog ? ' is-backlog' : ''}${draggable ? ' has-grip' : ''}`}
      data-testid={`quest-card-${quest.id}`}
      style={{ '--quest-stat': STAT_COLORS[quest.stat] } as CSSProperties}
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
          <span className="quest-card-when">{whenLabel(quest)}</span>
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
