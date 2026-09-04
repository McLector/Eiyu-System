import { useState } from 'react';
import { Quest, FULL_XP, STAT_COLORS, RANK_CONFIG, STATS, DAYS, splitQuestsByType, formatDisplayDate } from '@eiyu/shared';
import { StatIcon, CheckIcon, PlusIcon } from '../Icons';
import { useEiyu } from '../store/eiyu-store';

interface Props {
  onNewQuest: () => void;
  onEditQuest: (id: string) => void;
}

function XpBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ height: 4, borderRadius: 4, background: 'var(--c-track)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
    </div>
  );
}

function QuestRow({ quest, onToggle, onRecover, onEdit, onAdjustProgress }: {
  quest: Quest; onToggle: () => void; onRecover: () => void; onEdit: () => void; onAdjustProgress: (delta: number) => void;
}) {
  const color = STAT_COLORS[quest.stat];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      borderRadius: 12,
      background: quest.completed ? 'rgba(74,222,128,0.05)' : 'var(--c-accent-glass)',
      border: `1px solid ${quest.completed ? 'rgba(74,222,128,0.18)' : 'var(--c-glass-border)'}`,
      opacity: quest.frozen ? 0.6 : 1,
      transition: 'all 0.2s',
    }}>
      {/* Checkbox, or a +/- stepper for quantity habits (Slice 5) */}
      {quest.targetCount == null ? (
        <button onClick={onToggle} disabled={quest.frozen} style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          background: quest.completed ? 'rgba(74,222,128,0.18)' : 'transparent',
          border: `1.5px solid ${quest.completed ? 'rgba(74,222,128,0.5)' : color + '55'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: quest.frozen ? 'default' : 'pointer',
        }}>
          {quest.completed && <CheckIcon />}
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={() => onAdjustProgress(-1)} disabled={quest.progressCount <= 0} style={{
            width: 24, height: 24, borderRadius: 6, border: `1px solid ${color}55`, background: 'transparent',
            cursor: quest.progressCount <= 0 ? 'default' : 'pointer', opacity: quest.progressCount <= 0 ? 0.4 : 1,
            fontFamily: 'Inter', fontSize: 15, lineHeight: 1, color: 'var(--c-text)',
          }}>−</button>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: quest.completed ? '#4ade80' : 'var(--c-text)', minWidth: 32, textAlign: 'center' }}>
            {quest.progressCount}/{quest.targetCount}
          </span>
          <button onClick={() => onAdjustProgress(1)} disabled={quest.progressCount >= quest.targetCount} style={{
            width: 24, height: 24, borderRadius: 6, border: `1px solid ${color}55`, background: 'transparent',
            cursor: quest.progressCount >= quest.targetCount ? 'default' : 'pointer', opacity: quest.progressCount >= quest.targetCount ? 0.4 : 1,
            fontFamily: 'Inter', fontSize: 15, lineHeight: 1, color: 'var(--c-text)',
          }}>+</button>
        </div>
      )}

      {/* Info — clicking name area opens editor */}
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onEdit}>
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: quest.completed ? 'var(--c-muted)' : 'var(--c-text)', textDecoration: quest.completed ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {quest.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <StatIcon stat={quest.stat} size={12} />
          <span style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, color, letterSpacing: '0.08em' }}>{quest.stat}</span>
          <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-dim)' }}>{quest.difficulty}</span>
          {quest.streak > 0 && (
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 4, padding: '1px 5px' }}>
              🔥 {quest.streak}
            </span>
          )}
          {quest.frozen && (
            <span style={{ fontFamily: 'Rajdhani', fontSize: 10, fontWeight: 600, color: '#67e8f9', letterSpacing: '0.08em' }}>FROZEN</span>
          )}
        </div>
      </div>

      {/* Days + recover */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {DAYS.map((d, i) => (
            <div key={d} style={{
              width: 17, height: 17, borderRadius: 4,
              background: quest.days.includes(i) ? color + '22' : 'transparent',
              border: `1px solid ${quest.days.includes(i) ? color + '55' : 'var(--c-glass-border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontFamily: 'Rajdhani', fontSize: 8, fontWeight: 700, color: quest.days.includes(i) ? color : 'var(--c-dim)' }}>{d[0]}</span>
            </div>
          ))}
        </div>
        {quest.frozen && (
          <button onClick={onRecover} title="Complete the missed day to restore your streak" style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
            fontFamily: 'Rajdhani', fontSize: 10, fontWeight: 700, color: '#67e8f9', letterSpacing: '0.06em',
          }}>
            RECOVER
          </button>
        )}
      </div>
    </div>
  );
}

export default function WebBoard({ onNewQuest, onEditQuest }: Props) {
  const { user, questsLoading, questsError, retryQuests, toggleQuest: toggleQuestAction, adjustProgress, completeRecovery } = useEiyu();
  const rankCfg = RANK_CONFIG[user.rank];
  const completedToday = user.quests.filter(q => q.completed).length;
  const totalToday = user.quests.filter(q => q.days.includes(new Date().getDay())).length;
  const { habitQuests, oneTimeQuests } = splitQuestsByType(user.quests);
  const [xpToast, setXpToast] = useState<string | null>(null);

  const toggleQuest = (id: string) => {
    const q = user.quests.find(q => q.id === id);
    if (!q || q.frozen) return;
    if (!q.completed) {
      setXpToast(`+${FULL_XP} ${q.stat} XP`);
      setTimeout(() => setXpToast(null), 2000);
    }
    toggleQuestAction(id);
  };

  if (questsLoading) {
    return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Inter', fontSize: 13, color: 'var(--c-dim)' }}>Loading…</div>;
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
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, alignItems: 'start' }}>
      {/* Left panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Profile card */}
        <div className="glass" style={{ padding: '20px' }}>
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
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-muted)', marginTop: 2 }}>{user.userClass}</div>
            </div>
            <div style={{
              width: 42, height: 42, borderRadius: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: rankCfg.bg, border: `2px solid ${rankCfg.color}`,
              fontFamily: 'Rajdhani', fontSize: 20, fontWeight: 700, color: rankCfg.color,
              boxShadow: `0 0 16px ${rankCfg.glow}`,
            }}>{user.rank}</div>
          </div>
        </div>

        {/* Stats card */}
        <div className="glass" style={{ padding: '16px 20px' }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim)', marginBottom: 12 }}>ATTRIBUTES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {STATS.map(stat => {
              const s = user.stats[stat];
              return (
                <div key={stat}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <StatIcon stat={stat} size={13} />
                    <span style={{ fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: STAT_COLORS[stat], letterSpacing: '0.08em', flex: 1 }}>{stat}</span>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 600, color: STAT_COLORS[stat] }}>Lv.{s.level}</span>
                    <span style={{ fontFamily: 'Inter', fontSize: 10, color: 'var(--c-dim)' }}>{s.xp}/{s.xpMax}</span>
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

        {/* Daily summary */}
        <div className="glass-sm" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim)', marginBottom: 4 }}>TODAY</div>
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-dim)', marginBottom: 4 }}>
              {formatDisplayDate(new Date())}
            </div>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 22, fontWeight: 700, color: 'var(--c-text)' }}>
              {completedToday} <span style={{ color: 'var(--c-dim)', fontWeight: 500 }}>/ {totalToday} quests</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {Array.from({ length: totalToday }).map((_, i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: 3, background: i < completedToday ? '#4ade80' : 'var(--c-glass-border)', boxShadow: i < completedToday ? '0 0 6px #4ade8066' : 'none' }} />
            ))}
          </div>
        </div>

        {/* Quest list */}
        <div className="glass" style={{ padding: '18px 18px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 14, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.06em' }}>DAILY QUESTS</div>
            <button onClick={onNewQuest} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.08em' }}>
              <PlusIcon />
              ADD QUEST
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {user.quests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: 'Inter', fontSize: 13, color: 'var(--c-dim)' }}>No quests yet — add your first quest above</div>
            ) : (
              <>
                <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--c-dim)' }}>TODAY&apos;S HABITS</div>
                {habitQuests.length === 0 ? (
                  <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim)', padding: '4px 0 8px' }}>No habits scheduled for today.</div>
                ) : (
                  habitQuests.map(q => (
                    <QuestRow key={q.id} quest={q} onToggle={() => toggleQuest(q.id)} onRecover={() => completeRecovery(q.id)} onEdit={() => onEditQuest(q.id)} onAdjustProgress={delta => adjustProgress(q.id, delta)} />
                  ))
                )}
                {oneTimeQuests.length > 0 && (
                  <>
                    <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--c-dim)', marginTop: 8 }}>ONE-TIME QUESTS</div>
                    {oneTimeQuests.map(q => (
                      <QuestRow key={q.id} quest={q} onToggle={() => toggleQuest(q.id)} onRecover={() => completeRecovery(q.id)} onEdit={() => onEditQuest(q.id)} onAdjustProgress={delta => adjustProgress(q.id, delta)} />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
