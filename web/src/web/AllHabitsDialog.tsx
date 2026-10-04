import { DAYS, type Quest } from '@eiyu/shared';
import Dialog from '../components/Dialog';
import PaginatedList from '../components/PaginatedList';
import ActionMenu from '../components/ActionMenu';
import { ArchiveIcon, EditIcon, TrashIcon } from '../Icons';

function CatalogCard({ quest, pending, onOpen, onEdit, onArchive, onDelete }: {
  quest: Quest; pending: boolean; onOpen: () => void; onEdit: () => void; onArchive: () => void; onDelete: () => void;
}) {
  const schedule = quest.days.length === 7 ? 'Every day' : quest.days.map(day => DAYS[day]).join(', ');
  const status = quest.dailyEligible ? 'TODAY' : 'OFF DAY';
  return (
    <article className="board-catalog-card">
      <button type="button" aria-label={`View ${quest.name} details`} title={quest.name} onClick={onOpen}>
        <span className="board-catalog-name">{quest.name}</span>
        <span className="board-catalog-meta">{schedule} · {quest.time}{quest.dailyEligible && quest.targetCount != null ? ` · ${quest.progressCount}/${quest.targetCount}` : ''}</span>
      </button>
      <div className="board-catalog-actions">
        <span className={`board-catalog-status${quest.dailyEligible && quest.completed ? ' is-complete' : ''}`}>
          {quest.dailyEligible && quest.completed ? 'DONE' : status}
        </span>
        <ActionMenu
          label={`More actions for ${quest.name}`} disabled={pending} busy={pending}
          items={[
            { label: 'Edit Quest', ariaLabel: `Edit ${quest.name}`, onSelect: onEdit, icon: <EditIcon />, tone: 'edit' },
            { label: 'Archive', ariaLabel: `Archive ${quest.name}`, onSelect: onArchive, icon: <ArchiveIcon />, tone: 'warn' },
            { label: 'Delete', ariaLabel: `Delete ${quest.name}`, onSelect: onDelete, icon: <TrashIcon />, danger: true, tone: 'danger' },
          ]}
        />
      </div>
    </article>
  );
}

/** Every saved habit, scheduled today or not. Opened from the Daily lane; it used to be a lane of its own. */
export default function AllHabitsDialog({ habits, pendingIds, onClose, onOpen, onEdit, onArchive, onDelete }: {
  habits: Quest[]; pendingIds: Set<string>; onClose: () => void;
  onOpen: (quest: Quest) => void; onEdit: (quest: Quest) => void; onArchive: (quest: Quest) => void; onDelete: (quest: Quest) => void;
}) {
  return (
    <Dialog title="All habits" onClose={onClose}>
      <div className="all-habits-list">
        <PaginatedList label="All habits" empty="No saved habits yet. Add a recurring quest to build your catalog.">
          {habits.map(quest => (
            <CatalogCard key={quest.id} quest={quest} pending={pendingIds.has(quest.id)}
              onOpen={() => onOpen(quest)} onEdit={() => onEdit(quest)} onArchive={() => onArchive(quest)} onDelete={() => onDelete(quest)} />
          ))}
        </PaginatedList>
      </div>
    </Dialog>
  );
}
