import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Quest,
  FULL_XP,
  STAT_COLORS,
  RANK_CONFIG,
  STATS,
  DAYS,
  partitionBoardQuests,
  profileInitials,
  boardTodayProgress,
  formatDisplayDate,
  tintSecondaryText,
  boardSummaryLine,
  formatError,
} from '@eiyu/shared';
import { StatIcon, CheckIcon, PlusIcon, SnowflakeIcon } from '../Icons';
import { useEiyu } from '../store/eiyu-store';
import SignaturePanel from '../SignaturePanel';
import FireStreak from '../FireStreak';
import Dialog from '../components/Dialog';
import PaginatedList from '../components/PaginatedList';
import { announceArchive } from '../components/ArchiveNotice';

interface Props {
  onNewQuest: (type: 'habit' | 'one_time') => void;
  onEditQuest: (id: string) => void;
  darkMode: boolean;
  storageScope?: string;
}

type BoardLaneId = 'profile' | 'daily-quest' | 'one-time-quest' | 'all-habits';

export function BoardDeleteDialog({ quest, onCancel, onDelete }: {
  quest: Quest;
  onCancel: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const overlay = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef(document.activeElement as HTMLElement | null);

  useEffect(() => {
    cancel.current?.focus();
    const background = Array.from(document.body.children).filter(node => node !== overlay.current) as HTMLElement[];
    const previous = background.map(node => ({ node, inert: node.inert, ariaHidden: node.getAttribute('aria-hidden') }));
    for (const node of background) { node.inert = true; node.setAttribute('aria-hidden', 'true'); }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!inFlight.current) onCancel();
      }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []);
      if (!buttons.length) { event.preventDefault(); dialog.current?.focus(); return; }
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    const originalTrigger = trigger.current;
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      for (const state of previous) {
        state.node.inert = state.inert;
        if (state.ariaHidden === null) state.node.removeAttribute('aria-hidden');
        else state.node.setAttribute('aria-hidden', state.ariaHidden);
      }
      if (originalTrigger?.isConnected) originalTrigger.focus();
      else document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    };
  }, [onCancel]);

  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await onDelete(quest.id);
      onCancel();
    } catch (err) {
      setError(formatError(err));
      inFlight.current = false;
      setPending(false);
    }
  };

  return createPortal(
    <div ref={overlay} data-eiyu-dialog data-theme={document.querySelector<HTMLElement>('.surface-flat[data-theme]')?.dataset.theme} className="board-delete-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !inFlight.current) onCancel(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="board-delete-title" aria-describedby="board-delete-description" tabIndex={-1} className="panel-flat board-delete-dialog">
        <strong id="board-delete-title">Delete {quest.name} permanently?</strong>
        <p id="board-delete-description">This permanently removes the saved quest. Its History, Weekly Review, and earned XP remain. This cannot be undone.</p>
        {error && <p role="alert" className="board-delete-error">{error}</p>}
        <div className="board-delete-actions">
          <button ref={cancel} type="button" className="btn-ghost" onClick={() => { if (!inFlight.current) onCancel(); }} disabled={pending}>Cancel</button>
          <button type="button" className="board-edit-button is-danger" onClick={() => void confirm()} disabled={pending}>{pending ? 'DELETING…' : 'Confirm permanent delete'}</button>
        </div>
      </div>
    </div>, document.body
  );
}

function XpBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ height: 4, borderRadius: 4, background: 'var(--c-track)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: '100%', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', background: color, borderRadius: 4, transition: 'transform 0.4s ease' }} />
    </div>
  );
}

function QuestCard({
  quest,
  onToggle,
  onEdit,
  onAdjustProgress,
  onArchive,
  onDelete,
  pending,
}: {
  quest: Quest;
  onToggle: () => void;
  onEdit: () => void;
  onAdjustProgress: (delta: number) => void;
  onArchive: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const color = STAT_COLORS[quest.stat];
  const completedLabel = quest.completed ? 'Undo' : 'Complete';
  const schedule = quest.questType === 'one_time'
    ? 'Today only'
    : quest.days.length === 7
      ? 'Every day'
      : quest.days.map(day => DAYS[day]).join(', ');

  return (
    <article className="board-quest-card" data-testid={`quest-card-${quest.id}`}>
      <div className="board-card-topline">
        <span className="board-card-stat" style={{ color }}>
          <StatIcon stat={quest.stat} size={12} /> {quest.stat}
        </span>
        <span className="board-card-difficulty">{quest.difficulty}</span>
        {quest.questType === 'one_time' && <span className="board-card-type">ONE TIME</span>}
      </div>
      <button type="button" className="board-card-title" aria-label={`Edit ${quest.name}`} onClick={onEdit}>
        {quest.name}
      </button>
      <div className="board-card-meta">
        <span>{schedule}</span>
        <span>{quest.time}</span>
        {quest.streak > 0 && <span className="board-card-streak"><FireStreak size={11} /> {quest.streak}</span>}
        {quest.frozen && <SnowflakeIcon size={12} />}
      </div>
      {quest.description && <button className="board-edit-button" onClick={onEdit}>Show note</button>}
      <div className="board-card-actions">
        {quest.targetCount == null ? (
          <button
            type="button"
            className={`board-action-button${quest.completed ? ' is-complete' : ''}`}
            onClick={onToggle}
            aria-label={`${completedLabel} ${quest.name}`}
            aria-pressed={quest.completed}
          >
            {quest.completed ? <CheckIcon /> : null}
            {completedLabel}
          </button>
        ) : (
          <div className="board-progress-stepper" aria-label={`${quest.name} progress`}>
            <button type="button" aria-label={`Decrease progress for ${quest.name}`} onClick={() => onAdjustProgress(-1)} disabled={quest.progressCount <= 0}>−</button>
            <span>{quest.progressCount}/{quest.targetCount}</span>
            <button type="button" aria-label={`Increase progress for ${quest.name}`} onClick={() => onAdjustProgress(1)} disabled={quest.progressCount >= quest.targetCount}>+</button>
          </div>
        )}
        <button type="button" className="board-edit-button" onClick={onEdit} aria-label={`Open ${quest.name} details`}>
          DETAILS
        </button>
      </div>
      <div className="board-card-lifecycle">
        <button type="button" className="board-edit-button" onClick={onArchive} aria-label={`Archive ${quest.name}`} disabled={pending}>{pending ? 'ARCHIVING…' : 'ARCHIVE'}</button>
        <button type="button" className="board-edit-button is-danger" onClick={onDelete} aria-label={`Delete ${quest.name}`} disabled={pending}>DELETE</button>
      </div>
    </article>
  );
}

function CatalogCard({ quest, onEdit, onArchive, onDelete, pending }: { quest: Quest; onEdit: () => void; onArchive: () => void; onDelete: () => void; pending: boolean }) {
  const schedule = quest.questType === 'one_time'
    ? 'One-time quest'
    : quest.days.length === 7
      ? 'Every day'
      : quest.days.map(day => DAYS[day]).join(', ');
  const status = quest.dailyEligible ? 'TODAY' : 'OFF DAY';

  return (
    <article className="board-catalog-card">
      <button type="button" aria-label={`Edit ${quest.name}`} onClick={onEdit}>
        <span className="board-catalog-name">{quest.name}</span>
        <span className="board-catalog-meta">{schedule} · {quest.time}{quest.dailyEligible && quest.targetCount != null ? ` · ${quest.progressCount}/${quest.targetCount}` : ''}</span>
      </button>
      <div className="board-catalog-actions">
        <span className={`board-catalog-status${quest.dailyEligible && quest.completed ? ' is-complete' : ''}`}>
          {quest.dailyEligible && quest.completed ? 'DONE' : status}
        </span>
        <button type="button" className="board-edit-button" onClick={onArchive} aria-label={`Archive ${quest.name}`} disabled={pending}>{pending ? 'ARCHIVING…' : 'ARCHIVE'}</button>
        <button type="button" className="board-edit-button is-danger" onClick={onDelete} aria-label={`Delete ${quest.name}`} disabled={pending}>DELETE</button>
      </div>
    </article>
  );
}

export function ArchivedCard({ quest, onEdit, onRestore, onDelete, pending }: { quest: Quest; onEdit: () => void; onRestore: () => void; onDelete: () => void; pending: boolean }) {
  return (
    <article className="board-catalog-card is-archived">
      <button type="button" aria-label={`Edit ${quest.name}`} onClick={onEdit}>
        <span className="board-catalog-name">{quest.name}</span>
        <span className="board-catalog-meta">{quest.questType === 'one_time' ? 'One-time quest' : 'Recurring habit'} · saved details</span>
      </button>
      <div className="board-catalog-actions">
        <span className="board-catalog-status">ARCHIVED</span>
        <button type="button" className="board-edit-button" onClick={onRestore} aria-label={`Restore ${quest.name}`} disabled={pending}>{pending ? 'RESTORING…' : 'RESTORE'}</button>
        <button type="button" className="board-edit-button is-danger" onClick={onDelete} aria-label={`Delete ${quest.name}`} disabled={pending}>DELETE</button>
      </div>
    </article>
  );
}

function BoardLane({
  id,
  title,
  count,
  children,
  empty,
  action,
  active,
}: {
  id: string;
  title: string;
  count: number;
  children: ReactNode;
  empty: string | false;
  action?: ReactNode;
  active?: boolean;
  storageKey?: string;
}) {
  return (
    <section className={`board-lane${active ? ' is-mobile-active' : ''}`} aria-labelledby={`${id}-heading`} data-testid={`board-lane-${id}`}>
      <header className="board-lane-header">
        <div>
          <h2 id={`${id}-heading`}>{title}</h2>
          <span>{count} {count === 1 ? 'item' : 'items'}</span>
        </div>
        {action}
      </header>
      <PaginatedList label={title} empty={empty || undefined}>{children}</PaginatedList>
    </section>
  );
}

function recoveryDeadlineLabel(quest: Quest) {
  if (!quest.recoveryDeadline) return `${quest.frozenHoursLeft ?? 0}h left`;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: quest.recoveryTimeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(quest.recoveryDeadline));
}

export default function WebBoard({ onNewQuest, onEditQuest, darkMode, storageScope = 'board' }: Props) {
  const {
    user,
    questsLoading,
    questsError,
    retryQuests,
    toggleQuest: toggleQuestAction,
    adjustProgress,
    completeRecovery,
    archiveQuest,
    deleteQuest,
  } = useEiyu();
  const rankCfg = RANK_CONFIG[user.rank];
  const { dailyQuests, recoveryRequired, oneTimeQuests, allHabits } = partitionBoardQuests(user.quests);
  const { completed: completedToday, total: totalToday } = boardTodayProgress({ dailyQuests, oneTimeQuests });
  const [xpToast, setXpToast] = useState<string | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Quest | null>(null);
  const [pendingLifecycleIds, setPendingLifecycleIds] = useState<Set<string>>(() => new Set());
  const lifecycleInFlight = useRef(new Set<string>());
  const storagePrefix = `eiyu:${storageScope}`;
  const [activeLane, setActiveLane] = useState<BoardLaneId>(() => {
    const saved = typeof window !== 'undefined' ? window.sessionStorage.getItem(`${storagePrefix}:lane`) : null;
    return saved === 'one-time-quest' || saved === 'all-habits' || saved === 'profile' ? saved : 'daily-quest';
  });

  useEffect(() => {
    if (questsLoading || questsError) return;
    const restore = window.requestAnimationFrame(() => {
      const savedY = Number(window.sessionStorage.getItem(`${storagePrefix}:page-scroll`) || 0);
      if (savedY > 0) window.scrollTo(0, savedY);
    });
    const save = () => window.sessionStorage.setItem(`${storagePrefix}:page-scroll`, String(window.scrollY));
    window.addEventListener('scroll', save, { passive: true });
    return () => { window.cancelAnimationFrame(restore); save(); window.removeEventListener('scroll', save); };
  }, [questsLoading, questsError, storagePrefix]);

  const selectLane = (lane: BoardLaneId) => {
    setActiveLane(lane);
    window.sessionStorage.setItem(`${storagePrefix}:lane`, lane);
  };

  const confirmDelete = (quest: Quest) => {
    setDeleteTarget(quest);
  };

  const queueLifecycle = (id: string, action: () => Promise<void>) => {
    if (lifecycleInFlight.current.has(id)) return;
    lifecycleInFlight.current.add(id);
    setPendingLifecycleIds(new Set(lifecycleInFlight.current));
    void action().catch(() => {
      // The store publishes the failure through the board Retry state.
    }).finally(() => {
      lifecycleInFlight.current.delete(id);
      setPendingLifecycleIds(new Set(lifecycleInFlight.current));
    });
  };

  const toggleQuest = async (id: string) => {
    const quest = user.quests.find(q => q.id === id);
    if (!quest) return;
    const succeeded = await toggleQuestAction(id);
    if (succeeded && !quest.completed) {
      setXpToast(`+${FULL_XP} ${quest.stat} XP`);
      setTimeout(() => setXpToast(null), 2000);
    }
  };

  if (questsLoading) return <div className="board-state" role="status">Reading the board…</div>;
  if (questsError) {
    return (
      <div className="board-state" role="alert">
        <p>{questsError}</p>
        <button onClick={() => void retryQuests()} className="btn-ghost">RETRY</button>
      </div>
    );
  }

  return (
    <div className="web-board-shell">
      {xpToast && <div className="board-xp-toast" role="status">{xpToast}</div>}

      <nav className="board-lane-tabs" aria-label="Board lanes" role="tablist">
        {([
          ['profile', 'Profile', 5],
          ['daily-quest', 'Daily Quest', dailyQuests.length],
          ['one-time-quest', 'One Time Quest', oneTimeQuests.length],
          ['all-habits', 'All Habits', allHabits.length],
        ] as const).map(([id, title, count]) => (
          <button key={id} type="button" role="tab" aria-selected={activeLane === id} onClick={() => selectLane(id)}>
            {title} <span>{count}</span>
          </button>
        ))}
      </nav>

      <section className="board-lanes" aria-label="Quest board">
      <section className={`board-profile-column${activeLane === 'profile' ? ' is-mobile-active' : ''}`} aria-label="Board overview">
        <SignaturePanel style={{ padding: 14 }}>
          <div className="web-board-profile">
            <div className="web-board-avatar">{profileInitials(user.name)}</div>
            <div className="web-board-profile-copy">
              <div className="web-board-profile-name">{user.name}</div>
              <div className="web-board-profile-class">{user.userClass}</div>
            </div>
            <div aria-label={`Hero Rank ${user.rank}`} className="web-board-rank" style={{ background: rankCfg.bg, borderColor: rankCfg.color, color: rankCfg.color, boxShadow: `0 0 16px ${rankCfg.glow}` }}>{user.rank}</div>
          </div>
        <div className="web-board-attributes">
          <div className="web-board-eyebrow">ATTRIBUTES</div>
          {STATS.map((stat, index) => {
            const statData = user.stats[stat];
            return (
              <div className="web-board-stat" key={stat}>
                <div className="web-board-stat-heading">
                  <StatIcon stat={stat} size={13} />
                  <span style={{ color: STAT_COLORS[stat] }}>{stat}</span>
                  <strong style={{ color: STAT_COLORS[stat] }}>Lv.{statData.level}</strong>
                  <small style={{ color: tintSecondaryText(STAT_COLORS[stat], darkMode) }}>{statData.xp}/{statData.xpMax}</small>
                </div>
                <XpBar value={statData.xp} max={statData.xpMax} color={STAT_COLORS[stat]} />
                {index === STATS.length - 1 ? null : <span className="web-board-stat-divider" />}
              </div>
            );
          })}
        </div>
        <div className="web-board-today">
          <div className="web-board-eyebrow">TODAY · {formatDisplayDate(new Date(), user.timeZone)}</div>
          <strong>{completedToday} <span>/ {totalToday} quests</span></strong>
          <p>{boardSummaryLine(completedToday, totalToday)}</p>
        </div>
        {recoveryRequired.length > 0 && <button className="btn-ghost board-recovery-trigger" onClick={() => setRecoveryOpen(true)}>{recoveryRequired.length} recovery required</button>}
        </SignaturePanel>
      </section>

        <BoardLane id="daily-quest" title="Daily Quest" count={dailyQuests.length} active={activeLane === 'daily-quest'} storageKey={`${storagePrefix}:daily-quest-scroll`} empty={dailyQuests.length === 0 ? 'No habits are scheduled for today. Create one or check All Habits.' : false} action={<button onClick={() => onNewQuest('habit')} className="btn-ghost board-add-button"><PlusIcon /> ADD QUEST</button>}>
          {dailyQuests.map(quest => <QuestCard key={quest.id} quest={quest} pending={pendingLifecycleIds.has(quest.id)} onToggle={() => toggleQuest(quest.id)} onEdit={() => onEditQuest(quest.id)} onAdjustProgress={delta => adjustProgress(quest.id, delta)} onArchive={() => queueLifecycle(quest.id, async () => { await archiveQuest(quest.id); announceArchive(quest.questType); })} onDelete={() => confirmDelete(quest)} />)}
        </BoardLane>
        <BoardLane id="one-time-quest" title="One Time Quest" count={oneTimeQuests.length} active={activeLane === 'one-time-quest'} storageKey={`${storagePrefix}:one-time-quest-scroll`} empty={oneTimeQuests.length === 0 ? 'No one-time quests scheduled for today.' : false} action={<button onClick={() => onNewQuest('one_time')} className="btn-ghost board-add-button"><PlusIcon /> ADD QUEST</button>}>
          {oneTimeQuests.map(quest => <QuestCard key={quest.id} quest={quest} pending={pendingLifecycleIds.has(quest.id)} onToggle={() => toggleQuest(quest.id)} onEdit={() => onEditQuest(quest.id)} onAdjustProgress={delta => adjustProgress(quest.id, delta)} onArchive={() => queueLifecycle(quest.id, async () => { await archiveQuest(quest.id); announceArchive(quest.questType); })} onDelete={() => confirmDelete(quest)} />)}
        </BoardLane>
        <BoardLane id="all-habits" title="All Habits" count={allHabits.length} active={activeLane === 'all-habits'} storageKey={`${storagePrefix}:all-habits-scroll`} empty={allHabits.length === 0 ? 'No saved habits yet. Add a recurring quest to build your catalog.' : false}>
          {allHabits.map(quest => <CatalogCard key={quest.id} quest={quest} pending={pendingLifecycleIds.has(quest.id)} onEdit={() => onEditQuest(quest.id)} onArchive={() => queueLifecycle(quest.id, async () => { await archiveQuest(quest.id); announceArchive(quest.questType); })} onDelete={() => confirmDelete(quest)} />)}
        </BoardLane>

      </section>
      {recoveryOpen && <Dialog title="Recovery required" onClose={() => setRecoveryOpen(false)}>
        {recoveryRequired.map(quest => <article className="board-recovery-card" key={quest.id}>
          <strong><SnowflakeIcon size={14} /> Streak frozen</strong><p>{quest.name}</p>
          <span>Until {recoveryDeadlineLabel(quest)}</span><p>Penalty: {quest.easyVersion}</p>
          <button className="btn-ghost" onClick={() => completeRecovery(quest.id)}>MARK RECOVERY COMPLETE</button>
        </article>)}
      </Dialog>}
      {deleteTarget && <BoardDeleteDialog quest={deleteTarget} onCancel={() => setDeleteTarget(null)} onDelete={deleteQuest} />}
    </div>
  );
}
