import type { CSSProperties } from 'react';
import { STAT_COLORS, questGenreLabel, type Quest } from '@eiyu/shared';
import { RestoreIcon, StatIcon } from '../Icons';

/** An archived quest in the same compact card as the board, with Restore and Delete always one tap away. */
export default function ArchivedCard({ quest, onOpen, onRestore, onDelete, pending, restoring = pending }: {
  quest: Quest; onOpen: () => void; onRestore: () => void; onDelete: () => void; pending: boolean; restoring?: boolean;
}) {
  const genre = questGenreLabel(quest.genre);
  return (
    <article className="quest-card is-archived" data-testid={`archived-card-${quest.id}`} style={{ '--quest-stat': STAT_COLORS[quest.stat] } as CSSProperties}>
      <button type="button" className="quest-card-open" aria-label={`View ${quest.name} details`} title={quest.name} onClick={onOpen}>
        <span className="quest-card-title">{quest.name}</span>
        <span className="quest-card-meta">
          <span className="quest-chip is-stat"><StatIcon stat={quest.stat} size={11} /> {quest.stat}</span>
          <span className="quest-card-when">{quest.questType === 'one_time' ? 'One-time quest' : 'Recurring habit'}</span>
          {genre && <span className="quest-chip">{genre}</span>}
        </span>
      </button>
      <div className="quest-card-controls">
        <button type="button" className="btn-quiet btn-compact" onClick={onRestore} aria-label={`Restore ${quest.name}`} disabled={pending}>
          {restoring ? 'RESTORING…' : <><RestoreIcon size={14} /> RESTORE</>}
        </button>
        <button type="button" className="btn-destructive btn-compact" onClick={onDelete} aria-label={`Delete ${quest.name}`} disabled={pending}>DELETE</button>
      </div>
    </article>
  );
}
