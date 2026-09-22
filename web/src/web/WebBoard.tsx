import { useState, type ReactNode } from 'react';
import {
  Quest,
  FULL_XP,
  STAT_COLORS,
  RANK_CONFIG,
  STATS,
  DAYS,
  partitionBoardQuests,
  formatDisplayDate,
  tintSecondaryText,
  boardSummaryLine,
} from '@eiyu/shared';
import { StatIcon, CheckIcon, PlusIcon, SnowflakeIcon } from '../Icons';
import { useEiyu } from '../store/eiyu-store';
import SignaturePanel from '../SignaturePanel';
import FireStreak from '../FireStreak';

interface Props {
  onNewQuest: () => void;
  onEditQuest: (id: string) => void;
  darkMode: boolean;
}

type BoardLaneId = 'daily-quest' | 'one-time-quest' | 'all-habits' | 'archived';

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
}: {
  quest: Quest;
  onToggle: () => void;
  onEdit: () => void;
  onAdjustProgress: (delta: number) => void;
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
      {quest.description && (
        <details className="board-card-note">
          <summary>Show note</summary>
          <p>{quest.description}</p>
        </details>
      )}
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
    </article>
  );
}

function CatalogCard({ quest, onEdit }: { quest: Quest; onEdit: () => void }) {
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
        <span className="board-catalog-meta">{schedule} · {quest.time}</span>
      </button>
      <span className="board-catalog-status">{status}</span>
    </article>
  );
}

function ArchivedCard({ quest, onEdit }: { quest: Quest; onEdit: () => void }) {
  return (
    <article className="board-catalog-card is-archived">
      <button type="button" aria-label={`Edit ${quest.name}`} onClick={onEdit}>
        <span className="board-catalog-name">{quest.name}</span>
        <span className="board-catalog-meta">{quest.questType === 'one_time' ? 'One-time quest' : 'Recurring habit'} · saved details</span>
      </button>
      <span className="board-catalog-status">ARCHIVED</span>
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
      <div className="board-lane-body">
        {empty ? <p className="board-lane-empty">{empty}</p> : children}
      </div>
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

export default function WebBoard({ onNewQuest, onEditQuest, darkMode }: Props) {
  const {
    user,
    questsLoading,
    questsError,
    retryQuests,
    toggleQuest: toggleQuestAction,
    adjustProgress,
    completeRecovery,
  } = useEiyu();
  const rankCfg = RANK_CONFIG[user.rank];
  const { dailyQuests, recoveryRequired, oneTimeQuests, allHabits, archivedQuests } = partitionBoardQuests(user.quests);
  const actionableToday = [...dailyQuests, ...oneTimeQuests];
  const completedToday = actionableToday.filter(q => q.completed).length;
  const totalToday = actionableToday.length;
  const [xpToast, setXpToast] = useState<string | null>(null);
  const [activeLane, setActiveLane] = useState<BoardLaneId>('daily-quest');

  const toggleQuest = (id: string) => {
    const quest = user.quests.find(q => q.id === id);
    if (!quest) return;
    if (!quest.completed) {
      setXpToast(`+${FULL_XP} ${quest.stat} XP`);
      setTimeout(() => setXpToast(null), 2000);
    }
    toggleQuestAction(id);
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

      <section className="web-board-overview" aria-label="Board overview">
        <SignaturePanel style={{ padding: 20 }}>
          <div className="web-board-profile">
            <div className="web-board-avatar">{user.name.split(' ').map(n => n[0]).join('')}</div>
            <div className="web-board-profile-copy">
              <div className="web-board-profile-name">{user.name}</div>
              <div className="web-board-profile-class">{user.userClass}</div>
            </div>
            <div className="web-board-rank" style={{ background: rankCfg.bg, borderColor: rankCfg.color, color: rankCfg.color, boxShadow: `0 0 16px ${rankCfg.glow}` }}>{user.rank}</div>
          </div>
        </SignaturePanel>
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
      </section>

      {recoveryRequired.length > 0 && (
        <section className="board-recovery" aria-labelledby="recovery-required-heading">
          <div className="board-section-heading">
            <h2 id="recovery-required-heading">Recovery required</h2>
            <span>{recoveryRequired.length} urgent</span>
          </div>
          <div className="board-recovery-list">
            {recoveryRequired.map(quest => (
              <article className="board-recovery-card" key={`recovery-${quest.id}`}>
                <div>
                  <strong><SnowflakeIcon size={14} /> Streak frozen</strong>
                  <span>Until {recoveryDeadlineLabel(quest)}</span>
                </div>
                <p>{quest.name}</p>
                <small>Penalty: {quest.easyVersion}</small>
                <button onClick={() => completeRecovery(quest.id)} className="btn-ghost">MARK RECOVERY COMPLETE</button>
              </article>
            ))}
          </div>
        </section>
      )}

      <nav className="board-lane-tabs" aria-label="Board lanes" role="tablist">
        {([
          ['daily-quest', 'Daily Quest', dailyQuests.length],
          ['one-time-quest', 'One Time Quest', oneTimeQuests.length],
          ['all-habits', 'All Habits', allHabits.length],
          ['archived', 'Archived', archivedQuests.length],
        ] as const).map(([id, title, count]) => (
          <button key={id} type="button" role="tab" aria-selected={activeLane === id} onClick={() => setActiveLane(id)}>
            {title} <span>{count}</span>
          </button>
        ))}
      </nav>

      <section className="board-lanes" aria-label="Quest board">
        <BoardLane id="daily-quest" title="Daily Quest" count={dailyQuests.length} active={activeLane === 'daily-quest'} empty={dailyQuests.length === 0 ? 'No habits are scheduled for today. Create one or check All Habits.' : false} action={<button onClick={onNewQuest} className="btn-ghost board-add-button"><PlusIcon /> ADD QUEST</button>}>
          {dailyQuests.map(quest => <QuestCard key={quest.id} quest={quest} onToggle={() => toggleQuest(quest.id)} onEdit={() => onEditQuest(quest.id)} onAdjustProgress={delta => adjustProgress(quest.id, delta)} />)}
        </BoardLane>
        <BoardLane id="one-time-quest" title="One Time Quest" count={oneTimeQuests.length} active={activeLane === 'one-time-quest'} empty={oneTimeQuests.length === 0 ? 'No one-time quests scheduled for today.' : false}>
          {oneTimeQuests.map(quest => <QuestCard key={quest.id} quest={quest} onToggle={() => toggleQuest(quest.id)} onEdit={() => onEditQuest(quest.id)} onAdjustProgress={delta => adjustProgress(quest.id, delta)} />)}
        </BoardLane>
        <BoardLane id="all-habits" title="All Habits" count={allHabits.length} active={activeLane === 'all-habits'} empty={allHabits.length === 0 ? 'No saved habits yet. Add a recurring quest to build your catalog.' : false}>
          {allHabits.map(quest => <CatalogCard key={quest.id} quest={quest} onEdit={() => onEditQuest(quest.id)} />)}
        </BoardLane>
        <BoardLane id="archived" title="Archived" count={archivedQuests.length} active={activeLane === 'archived'} empty={archivedQuests.length === 0 ? 'No archived quests. Archived definitions will stay here with their history.' : false}>
          {archivedQuests.map(quest => <ArchivedCard key={quest.id} quest={quest} onEdit={() => onEditQuest(quest.id)} />)}
        </BoardLane>
      </section>
    </div>
  );
}
