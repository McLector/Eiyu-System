import { useState } from 'react';
import { Quest, FULL_XP, STAT_COLORS, RANK_CONFIG, STATS, DAYS, partitionBoardQuests, formatDisplayDate, tintSecondaryText, boardSummaryLine } from '@eiyu/shared';
import { StatIcon, CheckIcon, PlusIcon, SnowflakeIcon } from '../Icons';
import { useEiyu } from '../store/eiyu-store';
import SignaturePanel from '../SignaturePanel';
import FireStreak from '../FireStreak';

interface Props {
  onNewQuest: () => void;
  onEditQuest: (id: string) => void;
  darkMode: boolean;
}

function XpBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ height: 4, borderRadius: 4, background: 'var(--c-track)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
    </div>
  );
}

function QuestRow({ quest, onToggle, onEdit, onAdjustProgress, isFirst }: {
  quest: Quest; onToggle: () => void; onEdit: () => void; onAdjustProgress: (delta: number) => void; isFirst: boolean;
}) {
  const color = STAT_COLORS[quest.stat];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0',
      borderTop: isFirst ? 'none' : '1px solid var(--c-divider-flat)',
      opacity: quest.frozen ? 0.85 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Checkbox, or a +/- stepper for quantity habits (Slice 5) */}
      {quest.targetCount == null ? (
        <button
          onClick={onToggle}
          aria-label={`${quest.completed ? 'Undo' : 'Complete'} ${quest.name}`}
          aria-pressed={quest.completed}
          style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          background: quest.completed ? 'rgba(74,222,128,0.18)' : 'transparent',
          border: `1.5px solid ${quest.frozen ? 'var(--c-ice-border)' : quest.completed ? 'rgba(74,222,128,0.5)' : color + '55'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          {quest.completed && <CheckIcon />}
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button aria-label={`Decrease progress for ${quest.name}`} onClick={() => onAdjustProgress(-1)} disabled={quest.progressCount <= 0} style={{
            width: 24, height: 24, borderRadius: 6, border: `1px solid ${color}55`, background: 'transparent',
            cursor: quest.progressCount <= 0 ? 'default' : 'pointer', opacity: quest.progressCount <= 0 ? 0.4 : 1,
            fontFamily: 'Inter', fontSize: 15, lineHeight: 1, color: 'var(--c-text)',
          }}>−</button>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: quest.completed ? '#4ade80' : 'var(--c-text)', minWidth: 32, textAlign: 'center' }}>
            {quest.progressCount}/{quest.targetCount}
          </span>
          <button aria-label={`Increase progress for ${quest.name}`} onClick={() => onAdjustProgress(1)} disabled={quest.progressCount >= quest.targetCount} style={{
            width: 24, height: 24, borderRadius: 6, border: `1px solid ${color}55`, background: 'transparent',
            cursor: quest.progressCount >= quest.targetCount ? 'default' : 'pointer', opacity: quest.progressCount >= quest.targetCount ? 0.4 : 1,
            fontFamily: 'Inter', fontSize: 15, lineHeight: 1, color: 'var(--c-text)',
          }}>+</button>
        </div>
      )}

      {/* Info — clicking name area opens editor */}
      <button
        type="button"
        aria-label={`Edit ${quest.name}`}
        style={{ flex: 1, minWidth: 0, cursor: 'pointer', padding: 0, border: 0, background: 'none', textAlign: 'left' }}
        onClick={onEdit}>
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: quest.completed ? 'var(--c-muted-flat)' : 'var(--c-text)', textDecoration: quest.completed ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {quest.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <StatIcon stat={quest.stat} size={12} />
          <span style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, color, letterSpacing: '0.08em' }}>{quest.stat}</span>
          <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-dim-flat)' }}>{quest.difficulty}</span>
          {quest.streak > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'JetBrains Mono', fontSize: 10, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 4, padding: '1px 5px' }}>
              <FireStreak size={11} /> {quest.streak}
            </span>
          )}
          {quest.frozen && (
            <span role="img" aria-label="Streak frozen" style={{ display: 'flex', filter: 'drop-shadow(0 0 4px var(--c-ice-glow))' }}>
              <SnowflakeIcon size={12} />
            </span>
          )}
        </div>
      </button>

      {/* Scheduled days. Recovery remains a separate, explicit action above. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {DAYS.map((d, i) => (
            <div key={d} style={{
              width: 17, height: 17, borderRadius: 4,
              background: quest.days.includes(i) ? color + '22' : 'transparent',
              border: `1px solid ${quest.days.includes(i) ? color + '55' : 'var(--c-glass-border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontFamily: 'Rajdhani', fontSize: 8, fontWeight: 700, color: quest.days.includes(i) ? color : 'var(--c-dim-flat)' }}>{d[0]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HabitCatalogRow({ quest, onEdit, isFirst }: { quest: Quest; onEdit: () => void; isFirst: boolean }) {
  const schedule = quest.days.length === 7 ? 'Every day' : quest.days.map(day => DAYS[day]).join(', ');
  const status = quest.archived ? 'ARCHIVED' : quest.dailyEligible ? 'TODAY' : 'OFF DAY';

  return (
    <button
      type="button"
      aria-label={`Edit ${quest.name}`}
      onClick={onEdit}
      style={{
        display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: '12px 0',
        border: 0, borderTop: isFirst ? 'none' : '1px solid var(--c-divider-flat)',
        background: 'none', color: 'inherit', textAlign: 'left', cursor: 'pointer',
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {quest.name}
        </div>
        <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-muted-flat)', marginTop: 3 }}>
          {schedule || 'No scheduled days'}
        </div>
      </div>
      <span style={{
        flexShrink: 0, padding: '2px 7px', borderRadius: 5,
        border: '1px solid var(--c-accent-border)', background: 'var(--c-accent-glass)',
        fontFamily: 'Rajdhani', fontSize: 10, fontWeight: 700,
        letterSpacing: '0.07em', color: quest.archived ? 'var(--c-muted-flat)' : 'var(--c-accent)',
      }}>
        {status}
      </span>
    </button>
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
  const { user, questsLoading, questsError, retryQuests, toggleQuest: toggleQuestAction, adjustProgress, completeRecovery } = useEiyu();
  const rankCfg = RANK_CONFIG[user.rank];
  const { dailyQuests, recoveryRequired, oneTimeQuests, allHabits } = partitionBoardQuests(user.quests);
  const activeHabits = allHabits.filter(quest => !quest.archived);
  const archivedHabits = allHabits.filter(quest => quest.archived);
  const completedToday = dailyQuests.filter(q => q.completed).length;
  const totalToday = dailyQuests.length;
  const [xpToast, setXpToast] = useState<string | null>(null);

  const toggleQuest = (id: string) => {
    const q = user.quests.find(q => q.id === id);
    if (!q) return;
    if (!q.completed) {
      setXpToast(`+${FULL_XP} ${q.stat} XP`);
      setTimeout(() => setXpToast(null), 2000);
    }
    toggleQuestAction(id);
  };

  if (questsLoading) {
    return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Inter', fontSize: 13, color: 'var(--c-dim-flat)' }}>Reading the board…</div>;
  }
  if (questsError) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: '#f87171', marginBottom: 12 }}>{questsError}</p>
        <button onClick={() => void retryQuests()} className="btn-ghost" style={{ padding: '8px 16px', fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700 }}>RETRY</button>
      </div>
    );
  }

  return (
    <div className="web-board-grid">
      {/* Left panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Profile card — signature panel (redesign spec sections 3, 8.1) */}
        <SignaturePanel style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: 'var(--c-accent-glass)', border: '2px solid var(--c-accent-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Rajdhani', fontSize: 20, fontWeight: 700, color: 'var(--c-accent)',
            }}>
              {user.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.1 }}>{user.name}</div>
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-muted-flat)', marginTop: 2 }}>{user.userClass}</div>
            </div>
            <div style={{
              width: 42, height: 42, borderRadius: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: rankCfg.bg, border: `2px solid ${rankCfg.color}`,
              fontFamily: 'Rajdhani', fontSize: 20, fontWeight: 700, color: rankCfg.color,
              boxShadow: `0 0 16px ${rankCfg.glow}`,
            }}>{user.rank}</div>
          </div>
        </SignaturePanel>

        {/* Stats — plain/grouping (redesign spec section 3) */}
        <div>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim-flat)', marginBottom: 12 }}>ATTRIBUTES</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {STATS.map((stat, i) => {
              const s = user.stats[stat];
              return (
                <div key={stat} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--c-divider-flat)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <StatIcon stat={stat} size={13} />
                    <span style={{ fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: STAT_COLORS[stat], letterSpacing: '0.08em', flex: 1 }}>{stat}</span>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 600, color: STAT_COLORS[stat] }}>Lv.{s.level}</span>
                    <span style={{ fontFamily: 'Inter', fontSize: 10, color: tintSecondaryText(STAT_COLORS[stat], darkMode) }}>{s.xp}/{s.xpMax}</span>
                  </div>
                  <XpBar value={s.xp} max={s.xpMax} color={STAT_COLORS[stat]} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
        {/* XP toast */}
        {xpToast && (
          <div style={{
            position: 'fixed', top: 80, right: 40, zIndex: 50,
            background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.4)',
            borderRadius: 10, padding: '8px 16px',
            fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 600, color: '#4ade80',
            boxShadow: '0 4px 24px rgba(74,222,128,0.2)',
            animation: 'fadeOut 2s ease forwards',
          }}>
            {xpToast}
          </div>
        )}

        {/* Daily summary — plain/grouping */}
        <div style={{ padding: '0 0 14px', borderBottom: '1px solid var(--c-divider-flat)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim-flat)', marginBottom: 4 }}>TODAY</div>
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-dim-flat)', marginBottom: 4 }}>
              {formatDisplayDate(new Date(), user.timeZone)}
            </div>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 22, fontWeight: 700, color: 'var(--c-text)' }}>
              {completedToday} <span style={{ color: 'var(--c-dim-flat)', fontWeight: 500 }}>/ {totalToday} quests</span>
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-muted-flat)', marginTop: 4 }}>
              {boardSummaryLine(completedToday, totalToday)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {Array.from({ length: totalToday }).map((_, i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: 3, background: i < completedToday ? '#4ade80' : 'var(--c-glass-border)', boxShadow: i < completedToday ? '0 0 6px #4ade8066' : 'none' }} />
            ))}
          </div>
        </div>

        {recoveryRequired.length > 0 && (
          <section aria-labelledby="recovery-required-heading">
            <h2 id="recovery-required-heading" style={{ margin: '0 0 10px', fontFamily: 'Rajdhani', fontSize: 14, color: 'var(--c-text)', letterSpacing: '0.08em' }}>
              RECOVERY REQUIRED
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recoveryRequired.map(quest => (
                <div key={`recovery-${quest.id}`} style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: 'rgba(59,130,246,0.1)', border: '1px solid var(--c-ice-border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <SnowflakeIcon size={14} />
                    <strong style={{ fontFamily: 'Rajdhani', fontSize: 12, letterSpacing: '0.08em', color: '#67e8f9' }}>
                      STREAK FROZEN — RECOVERY QUEST
                    </strong>
                    <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono', fontSize: 10, color: '#93c5fd' }}>
                      Until {recoveryDeadlineLabel(quest)}
                    </span>
                  </div>
                  <div style={{ marginTop: 8, fontFamily: 'Inter', fontSize: 13, color: 'var(--c-text)' }}>{quest.name}</div>
                  <div style={{ marginTop: 3, fontFamily: 'Inter', fontSize: 11, color: 'var(--c-muted-flat)' }}>
                    Penalty: {quest.easyVersion}
                  </div>
                  <button onClick={() => completeRecovery(quest.id)} className="btn-ghost" style={{ marginTop: 10, padding: '6px 12px', fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, color: '#67e8f9' }}>
                    MARK RECOVERY COMPLETE
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quest list — plain/grouping */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 14, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.06em' }}>DAILY QUESTS</div>
            <button onClick={onNewQuest} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.08em' }}>
              <PlusIcon />
              ADD QUEST
            </button>
          </div>
          {dailyQuests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: 'Inter', fontSize: 13, color: 'var(--c-dim-flat)' }}>
              No habits are scheduled for today. Your saved habits are still available under All Habits.
            </div>
          ) : dailyQuests.map((q, i) => (
            <QuestRow key={q.id} quest={q} isFirst={i === 0} onToggle={() => toggleQuest(q.id)} onEdit={() => onEditQuest(q.id)} onAdjustProgress={delta => adjustProgress(q.id, delta)} />
          ))}
        </div>

        <section aria-labelledby="one-time-heading">
          <h2 id="one-time-heading" style={{ margin: '0 0 10px', fontFamily: 'Rajdhani', fontSize: 14, color: 'var(--c-text)', letterSpacing: '0.06em' }}>
            ONE-TIME QUESTS
          </h2>
          {oneTimeQuests.length === 0 ? (
            <div style={{ padding: '16px 0', fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim-flat)' }}>No one-time quests scheduled for today.</div>
          ) : oneTimeQuests.map((q, i) => (
            <QuestRow key={q.id} quest={q} isFirst={i === 0} onToggle={() => toggleQuest(q.id)} onEdit={() => onEditQuest(q.id)} onAdjustProgress={delta => adjustProgress(q.id, delta)} />
          ))}
        </section>

        <section aria-labelledby="all-habits-heading">
          <h2 id="all-habits-heading" style={{ margin: '0 0 10px', fontFamily: 'Rajdhani', fontSize: 14, color: 'var(--c-text)', letterSpacing: '0.06em' }}>
            ALL HABITS
          </h2>
          {allHabits.length === 0 ? (
            <div style={{ padding: '16px 0', fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim-flat)' }}>No saved habits yet.</div>
          ) : (
            <>
              {activeHabits.map((q, i) => (
                <HabitCatalogRow key={q.id} quest={q} isFirst={i === 0} onEdit={() => onEditQuest(q.id)} />
              ))}
              {archivedHabits.length > 0 && (
                <div style={{ marginTop: activeHabits.length > 0 ? 14 : 0 }}>
                  <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--c-dim-flat)', marginBottom: 4 }}>ARCHIVED</div>
                  {archivedHabits.map((q, i) => (
                    <HabitCatalogRow key={q.id} quest={q} isFirst={i === 0} onEdit={() => onEditQuest(q.id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
