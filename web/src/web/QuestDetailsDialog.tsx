import type { CSSProperties } from 'react';
import { accountDateKey, QUEST_TYPE_LABEL, STAT_COLORS, questGenreLabel, questScheduleLabel, type Quest } from '@eiyu/shared';
import Dialog from '../components/Dialog';
import { EditIcon, RestoreIcon, StatIcon } from '../Icons';

/** Read-only details. Opens from the card; editing is a separate, explicit step. */
export default function QuestDetailsDialog({ quest, onClose, onEdit, archived }: {
  quest: Quest;
  onClose: () => void;
  onEdit?: () => void;
  archived?: { pending: boolean; onRestore: () => void; onDelete: () => void };
}) {
  const genre = questGenreLabel(quest.genre);
  return (
    <Dialog title="Quest details" onClose={onClose} pending={archived?.pending}>
      <div className="details" style={{ '--quest-stat': STAT_COLORS[quest.stat] } as CSSProperties}>
        <div className="details-chips">
          <span className="quest-chip is-stat"><StatIcon stat={quest.stat} size={11} /> {quest.stat}</span>
          <span className="quest-chip">{quest.difficulty}</span>
          {genre && <span className="quest-chip">{genre}</span>}
          <span className="quest-chip">{QUEST_TYPE_LABEL[quest.questType]}</span>
        </div>
        <h3 className="details-title">{quest.name}</h3>
        <p className="details-schedule">{questScheduleLabel(quest, accountDateKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone))}{quest.streak > 0 ? ` · ${quest.streak}-day streak` : ''}</p>
        {quest.description && <section><span className="field-label">NOTE</span><p className="details-note">{quest.description}</p></section>}
        {quest.questType === 'habit' && quest.easyVersion && <section><span className="field-label">PENALTY</span><p className="details-note">{quest.easyVersion}</p></section>}
        <div className="action-footer">
          {archived ? (
            <>
              <button type="button" className="btn-destructive" disabled={archived.pending} onClick={archived.onDelete}>Delete</button>
              <button type="button" className="btn-primary" disabled={archived.pending} onClick={archived.onRestore}><RestoreIcon size={14} /> Restore</button>
            </>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
              {onEdit && <button type="button" className="btn-primary" onClick={onEdit}><EditIcon size={14} /> Edit Quest</button>}
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
