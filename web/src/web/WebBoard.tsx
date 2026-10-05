import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Quest,
  FULL_XP,
  STAT_COLORS,
  RANK_CONFIG,
  STATS,
  partitionBoardQuests,
  profileInitials,
  boardTodayProgress,
  formatDisplayDate,
  tintSecondaryText,
  boardSummaryLine,
  recoveryDeadlineLabel,
  formatError,
  type QuestType,
} from '@eiyu/shared';
import { StatIcon, PlusIcon, SnowflakeIcon, ListIcon } from '../Icons';
import { useEiyu } from '../store/eiyu-store';
import SignaturePanel from '../SignaturePanel';
import Dialog from '../components/Dialog';
import PaginatedList from '../components/PaginatedList';
import StateBlock from '../components/StateBlock';
import { announceArchive, getNotificationOwner } from '../components/ArchiveNotice';
import QuestCard from './QuestCard';
import QuestDetailsDialog from './QuestDetailsDialog';
import AllHabitsDialog from './AllHabitsDialog';
import { hasQuestDrag, readQuestDrag } from './lane-drag';

interface Props {
  onNewQuest: (type: 'habit' | 'one_time' | 'backlog') => void;
  onEditQuest: (id: string) => void;
  darkMode: boolean;
  storageScope?: string;
}

type BoardLaneId = 'profile' | 'daily-quest' | 'one-time-quest' | 'backlog';

export function BoardDeleteDialog({ quest, onCancel, onDelete }: {
  quest: Quest;
  onCancel: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
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

  return <Dialog title={`Delete ${quest.name} permanently?`} onClose={onCancel} pending={pending} initialFocus="[data-cancel-delete]">
    <p>This permanently removes the saved quest. Its History, Weekly Review, and earned XP remain. This cannot be undone.</p>
    {error && <p role="alert">{error}</p>}
    <div className="action-footer"><button data-cancel-delete className="btn-secondary" onClick={onCancel} disabled={pending}>Cancel</button><button className="btn-destructive" onClick={() => void confirm()} disabled={pending}>{pending ? 'DELETING...' : 'Confirm permanent delete'}</button></div>
  </Dialog>;
}

function XpBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ height: 4, borderRadius: 4, background: 'var(--c-bar-track)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: '100%', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', background: color, borderRadius: 4, transition: 'transform var(--dur-slow) var(--ease-in-out)' }} />
    </div>
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
  acceptsFrom,
  onDropQuest,
  dragFrom,
  hint,
}: {
  id: string;
  title: string;
  count: number;
  children: ReactNode;
  empty: string | false;
  action?: ReactNode;
  active?: boolean;
  /** A quest dragged from this type may be dropped here. */
  acceptsFrom?: QuestType;
  onDropQuest?: (id: string) => void;
  /** The type of the quest currently being dragged, if any. */
  dragFrom?: QuestType | null;
  hint?: string;
}) {
  const [over, setOver] = useState(false);
  const droppable = !!acceptsFrom && !!onDropQuest;
  const ready = droppable && dragFrom === acceptsFrom;
  return (
    <section
      className={`board-lane${active ? ' is-mobile-active' : ''}${ready ? ' is-drop-ready' : ''}${over ? ' is-drop-target' : ''}`}
      aria-labelledby={`${id}-heading`}
      data-testid={`board-lane-${id}`}
      onDragOver={droppable ? event => {
        if (!hasQuestDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setOver(true);
      } : undefined}
      onDragLeave={droppable ? event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false); } : undefined}
      onDrop={droppable ? event => {
        event.preventDefault();
        setOver(false);
        const payload = readQuestDrag(event.dataTransfer);
        if (payload && payload.from === acceptsFrom) onDropQuest(payload.id);
      } : undefined}
    >
      <header className="board-lane-header">
        <div>
          <h2 id={`${id}-heading`}>{title}</h2>
          <span>{count} {count === 1 ? 'item' : 'items'}</span>
        </div>
        {action}
      </header>
      <PaginatedList label={title} empty={empty || undefined}>{children}</PaginatedList>
      {ready && hint && <div className="lane-drop-hint">{hint}</div>}
    </section>
  );
}

export default function WebBoard({ onNewQuest, onEditQuest, darkMode, storageScope = 'board' }: Props) {
  const {
    user,
    backlog = [],
    backlogLoading,
    questsLoading,
    questsError,
    retryQuests,
    toggleQuest: toggleQuestAction,
    adjustProgress,
    completeRecovery,
    archiveQuest,
    restoreQuest,
    deleteQuest,
    moveToOneTime,
    moveToBacklog,
  } = useEiyu();
  const rankCfg = RANK_CONFIG[user.rank];
  const { dailyQuests, recoveryRequired, oneTimeQuests, allHabits } = partitionBoardQuests(user.quests);
  const { completed: completedToday, total: totalToday } = boardTodayProgress({ dailyQuests, oneTimeQuests });
  const [xpToast, setXpToast] = useState<string | null>(null);
  const xpToastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(xpToastTimer.current), []);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [allHabitsOpen, setAllHabitsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Quest | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Quest | null>(null);
  const [dragging, setDragging] = useState<{ id: string; from: QuestType } | null>(null);
  const [pendingLifecycleIds, setPendingLifecycleIds] = useState<Set<string>>(() => new Set());
  const lifecycleInFlight = useRef(new Set<string>());
  const storagePrefix = `eiyu:${storageScope}`;
  const [activeLane, setActiveLane] = useState<BoardLaneId>(() => {
    const saved = typeof window !== 'undefined' ? window.sessionStorage.getItem(`${storagePrefix}:lane`) : null;
    return saved === 'one-time-quest' || saved === 'backlog' || saved === 'profile' ? saved : 'daily-quest';
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
      window.clearTimeout(xpToastTimer.current);
      xpToastTimer.current = window.setTimeout(() => setXpToast(null), 2000);
    }
  };

  const archive = (quest: Quest) => {
    const owner = getNotificationOwner();
    queueLifecycle(quest.id, async () => { await archiveQuest(quest.id); announceArchive(quest.questType, owner, () => restoreQuest(quest.id)); });
  };

  const move = (quest: Quest) => queueLifecycle(quest.id, () => (quest.questType === 'backlog' ? moveToOneTime(quest.id) : moveToBacklog(quest.id)));
  // A drop names a quest by id; only a movable quest of the opposite type is moved, so a stale or forged id is a no-op.
  const dropOn = (target: 'one_time' | 'backlog') => (id: string) => {
    const quest = (target === 'one_time' ? backlog : oneTimeQuests).find(candidate => candidate.id === id);
    // A finished One-time quest has a completion and cannot go back (no grip or menu item either).
    if (quest && !(target === 'backlog' && quest.completed)) move(quest);
  };

  const card = (quest: Quest) => (
    <QuestCard
      key={quest.id}
      quest={quest}
      pending={pendingLifecycleIds.has(quest.id)}
      onToggle={() => toggleQuest(quest.id)}
      onOpen={() => setDetailsTarget(quest)}
      onEdit={() => onEditQuest(quest.id)}
      onAdjustProgress={delta => adjustProgress(quest.id, delta)}
      onArchive={() => archive(quest)}
      onDelete={() => confirmDelete(quest)}
      onMove={quest.questType === 'habit' ? undefined : () => move(quest)}
      onDragStart={q => setDragging({ id: q.id, from: q.questType })}
      onDragEnd={() => setDragging(null)}
    />
  );
  const addButton = (type: 'habit' | 'one_time' | 'backlog') => (
    <button onClick={() => onNewQuest(type)} className="btn-secondary board-add-button"><PlusIcon /> ADD QUEST</button>
  );

  if (questsLoading) return <StateBlock kind="loading">Reading the board…</StateBlock>;
  if (questsError) return <StateBlock kind="error" retryLabel="RETRY" onRetry={() => void retryQuests()}>{questsError}</StateBlock>;

  return (
    <div className="web-board-shell">
      {xpToast && <div className="board-xp-toast feedback-card" data-tone="success" role="status">{xpToast}</div>}

      <nav className="board-lane-tabs" aria-label="Board lanes" role="tablist">
        {([
          ['profile', 'Profile', 5],
          ['daily-quest', 'Daily Quest', dailyQuests.length],
          ['one-time-quest', 'One Time Quest', oneTimeQuests.length],
          ['backlog', 'Backlog', backlog.length],
        ] as const).map(([id, title, count]) => (
          <button key={id} type="button" role="tab" aria-selected={activeLane === id} onClick={() => selectLane(id)}>
            {title} <span>{count}</span>
          </button>
        ))}
      </nav>

      {/* A moved card unmounts before its dragend fires, so a drop also ends the drag. */}
      <section className="board-lanes" aria-label="Quest board" onDropCapture={() => setDragging(null)}>
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
        {recoveryRequired.length > 0 && <button className="btn-secondary board-recovery-trigger" onClick={() => setRecoveryOpen(true)}>{recoveryRequired.length} recovery required</button>}
        </SignaturePanel>
      </section>

        <BoardLane id="daily-quest" title="Daily Quest" count={dailyQuests.length} active={activeLane === 'daily-quest'} empty={dailyQuests.length === 0 ? 'No habits are scheduled for today. Create one or open All Habits.' : false} action={
          <div className="board-lane-actions">
            {/* In a narrow lane the label is visually hidden (still named) so the header stays one row and four cards fit. */}
            <button type="button" className="btn-secondary btn-compact board-all-habits" title="All habits" onClick={() => setAllHabitsOpen(true)}><ListIcon size={14} /><span className="board-action-label">ALL HABITS</span></button>
            {addButton('habit')}
          </div>
        }>
          {dailyQuests.map(card)}
        </BoardLane>
        <BoardLane id="one-time-quest" title="One Time Quest" count={oneTimeQuests.length} active={activeLane === 'one-time-quest'} empty={oneTimeQuests.length === 0 ? 'No one-time quests scheduled for today. Drag one in from Backlog.' : false} action={addButton('one_time')}
          acceptsFrom="backlog" onDropQuest={dropOn('one_time')} dragFrom={dragging?.from ?? null} hint="Drop to schedule for today">
          {oneTimeQuests.map(card)}
        </BoardLane>
        <BoardLane id="backlog" title="Backlog" count={backlog.length} active={activeLane === 'backlog'} empty={backlogLoading ? 'Reading Backlog…' : backlog.length === 0 ? 'Nothing parked yet. Add an idea you want to do later.' : false} action={addButton('backlog')}
          acceptsFrom="one_time" onDropQuest={dropOn('backlog')} dragFrom={dragging?.from ?? null} hint="Drop to return to Backlog">
          {backlog.map(card)}
        </BoardLane>

      </section>
      {recoveryOpen && <Dialog title="Recovery required" onClose={() => setRecoveryOpen(false)}>
        {recoveryRequired.map(quest => <article className="board-recovery-card" key={quest.id}>
          <strong><SnowflakeIcon size={14} /> Streak frozen</strong><p>{quest.name}</p>
          <span>{recoveryDeadlineLabel(quest)}</span><p>Penalty: {quest.easyVersion}</p>
          <button className="btn-secondary" onClick={() => completeRecovery(quest.id)}>MARK RECOVERY COMPLETE</button>
        </article>)}
      </Dialog>}
      {allHabitsOpen && <AllHabitsDialog
        habits={allHabits}
        pendingIds={pendingLifecycleIds}
        onClose={() => setAllHabitsOpen(false)}
        onOpen={quest => { setAllHabitsOpen(false); setDetailsTarget(quest); }}
        onEdit={quest => { setAllHabitsOpen(false); onEditQuest(quest.id); }}
        onArchive={archive}
        onDelete={confirmDelete}
      />}
      {detailsTarget && <QuestDetailsDialog quest={detailsTarget} onClose={() => setDetailsTarget(null)} onEdit={() => { const id = detailsTarget.id; setDetailsTarget(null); onEditQuest(id); }} />}
      {deleteTarget && <BoardDeleteDialog quest={deleteTarget} onCancel={() => setDeleteTarget(null)} onDelete={deleteQuest} />}
    </div>
  );
}
