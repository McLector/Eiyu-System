import { useState } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { UserProfile, Stat } from '../types';
import { STAT_COLORS, STATS, RANK_CONFIG, DAYS } from '../data';
import { StatIcon } from '../Icons';

interface Props { user: UserProfile; darkMode: boolean; }

const WEEKLY_DATA: Record<string, number[]> = {
  STR: [2, 3, 1, 3, 2, 3, 0],
  INT: [3, 3, 2, 3, 3, 3, 2],
  DEX: [1, 2, 1, 2, 1, 2, 1],
  WIS: [2, 2, 2, 3, 2, 2, 2],
  CHA: [0, 1, 0, 1, 1, 1, 0],
};

const AI_TEXT = `Strong INT consistency this week — 3 completions on 5 days. STR shows improvement with back-to-back completions Wednesday through Friday. CHA remains the weakest point; consider adding a lighter social task to build momentum on off days. Your 7-day streak is a personal best — protect it heading into the weekend. WIS tracking is steady and close to threshold for a level-up next week if you maintain current pace.`;

function AiSummary() {
  const [expanded, setExpanded] = useState(false);
  const SHORT_LIMIT = 160;
  const isLong = AI_TEXT.length > SHORT_LIMIT;
  const displayed = expanded || !isLong ? AI_TEXT : AI_TEXT.slice(0, SHORT_LIMIT).trimEnd() + '…';

  return (
    <div style={{ padding: '14px 18px', borderRadius: 14, background: 'var(--c-accent-glass)', border: '1px solid var(--c-accent-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>✦</span>
        <span style={{ fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.1em' }}>AI ANALYSIS</span>
      </div>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted)', lineHeight: 1.6, margin: 0 }}>
        {displayed}
      </p>
      {isLong && (
        <button onClick={() => setExpanded(e => !e)} style={{
          marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-accent)',
        }}>
          {expanded ? 'SHOW LESS ↑' : 'READ MORE ↓'}
        </button>
      )}
    </div>
  );
}

function StatBar({ stat, user }: { stat: Stat; user: UserProfile }) {
  const s = user.stats[stat];
  const pct = Math.min(100, (s.xp / s.xpMax) * 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatIcon stat={stat} size={13} />
        <span style={{ fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: STAT_COLORS[stat], letterSpacing: '0.08em', flex: 1 }}>{stat}</span>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>Lv.{s.level}</span>
        <span style={{ fontFamily: 'Inter', fontSize: 10, color: 'var(--c-dim)' }}>{s.xp}/{s.xpMax} XP</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'var(--c-track)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: STAT_COLORS[stat], borderRadius: 4, transition: 'width 0.4s ease', boxShadow: `0 0 6px ${STAT_COLORS[stat]}55` }} />
      </div>
    </div>
  );
}

export default function WebStatus({ user, darkMode }: Props) {
  const [tab, setTab] = useState<'stats' | 'weekly'>('stats');
  const rankCfg = RANK_CONFIG[user.rank];

  const radarData = STATS.map(stat => ({
    subject: stat,
    value: user.stats[stat].level,
    fullMark: 50,
  }));

  const radarAccent = darkMode ? '#67e8f9' : '#0891b2';
  const radarFill = darkMode ? 'rgba(103,232,249,0.12)' : 'rgba(8,145,178,0.1)';
  const gridStroke = darkMode ? 'rgba(103,232,249,0.1)' : 'rgba(8,145,178,0.15)';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24, alignItems: 'start' }}>
      {/* Left panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Rank badge */}
        <div className="glass" style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', color: 'var(--c-dim)', marginBottom: 12 }}>HUNTER RANK</div>
          <div style={{
            width: 72, height: 72, borderRadius: 18, margin: '0 auto 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: rankCfg.bg, border: `2.5px solid ${rankCfg.color}`,
            fontFamily: 'Rajdhani', fontSize: 32, fontWeight: 700, color: rankCfg.color,
            boxShadow: `0 0 28px ${rankCfg.glow}`,
          }}>{user.rank}</div>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 15, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.08em' }}>{user.name}</div>
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-muted)', marginTop: 3 }}>{user.userClass}</div>
        </div>

        {/* Radar chart */}
        <div className="glass" style={{ padding: '16px 20px' }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim)', marginBottom: 8 }}>STAT OVERVIEW</div>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
              <PolarGrid stroke={gridStroke} strokeDasharray="3 3" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, fill: radarAccent, letterSpacing: '0.1em' }}
              />
              <Radar name="Stats" dataKey="value" stroke={radarAccent} fill={radarFill} strokeWidth={2} dot={{ r: 3, fill: radarAccent }} />
              <Tooltip
                contentStyle={{ background: darkMode ? 'rgba(5,18,35,0.95)' : 'rgba(237,248,255,0.95)', border: `1px solid ${radarAccent}33`, borderRadius: 10, fontFamily: 'JetBrains Mono', fontSize: 13, color: darkMode ? '#dff0fb' : '#0b1e32' }}
                formatter={(v: unknown) => [`Lv.${v}`, 'Level']}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Tab toggle */}
        <div className="glass-sm" style={{ display: 'flex', padding: 4, gap: 4 }}>
          {(['stats', 'weekly'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '9px 16px',
              borderRadius: 10,
              background: tab === t ? 'var(--c-accent-glass)' : 'transparent',
              border: `1px solid ${tab === t ? 'var(--c-accent-border)' : 'transparent'}`,
              fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700,
              color: tab === t ? 'var(--c-accent)' : 'var(--c-muted)',
              letterSpacing: '0.1em', cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {t === 'stats' ? 'STATS' : 'WEEKLY REVIEW'}
            </button>
          ))}
        </div>

        {tab === 'stats' && (
          <div className="glass" style={{ padding: '18px 20px' }}>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim)', marginBottom: 16 }}>ATTRIBUTE PROGRESS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {STATS.map(stat => <StatBar key={stat} stat={stat} user={user} />)}
            </div>
          </div>
        )}

        {tab === 'weekly' && (
          <>
            <div className="glass" style={{ padding: '18px 20px' }}>
              <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim)', marginBottom: 14 }}>THIS WEEK</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {STATS.map(stat => (
                  <div key={stat}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                      <StatIcon stat={stat} size={12} />
                      <span style={{ fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: STAT_COLORS[stat], letterSpacing: '0.08em', flex: 1 }}>{stat}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {DAYS.map((day, i) => {
                        const val = WEEKLY_DATA[stat][i];
                        const max = 3;
                        const pct = (val / max) * 100;
                        return (
                          <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: '100%', height: 52, borderRadius: 4, background: 'var(--c-track)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
                              <div style={{ width: '100%', height: `${pct}%`, background: STAT_COLORS[stat] + 'aa', borderRadius: 4, transition: 'height 0.3s' }} />
                            </div>
                            <span style={{ fontFamily: 'Rajdhani', fontSize: 9, fontWeight: 600, color: 'var(--c-dim)', letterSpacing: '0.06em' }}>{day[0]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI summary */}
            <AiSummary />
          </>
        )}
      </div>
    </div>
  );
}
