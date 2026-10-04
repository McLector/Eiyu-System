import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import {
  STAT_COLORS, STATS, RANK_CONFIG, tintSecondaryText, type Stat, type UserProfile,
  fetchWeeklyReview, fetchOrCreateWeeklySummary, regenerateWeeklySummary, formatError,
} from '@eiyu/shared';
import { WEEKLY_REVIEW_COPY } from '@eiyu/shared';
import { StatIcon, SparkleIcon } from '../Icons';
import { useEiyu } from '../store/eiyu-store';
import { useSession } from '../store/session-context';
import SignaturePanel from '../SignaturePanel';
import WebHeatmap from './WebHeatmap';
import WeeklyReviewMatrix from './WeeklyReviewMatrix';

interface Props { darkMode: boolean; }

function AiSummary({ userId, timeZone }: { userId: string; timeZone: string }) {
  const [expanded, setExpanded] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: summary, isPending, error, refetch } = useQuery({
    queryKey: ['weeklySummary', userId],
    queryFn: () => fetchOrCreateWeeklySummary(userId, timeZone),
    enabled: !!userId,
    staleTime: Infinity,
  });
  const SHORT_LIMIT = 160;

  const text = summary ?? '';
  const isLong = text.length > SHORT_LIMIT;
  const displayed = expanded || !isLong ? text : text.slice(0, SHORT_LIMIT).trimEnd() + '…';

  const handleRegenerate = async () => {
    if (regenerating || !summary) return;
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const nextSummary = await regenerateWeeklySummary(userId, timeZone);
      queryClient.setQueryData(['weeklySummary', userId], nextSummary);
    } catch (err) {
      const message = formatError(err);
      setRegenerateError(message.includes('regen cap reached')
        ? "You've used both regenerations for today — more tomorrow"
        : message);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <SignaturePanel style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span aria-hidden="true" style={{ display: 'flex' }}>
          <SparkleIcon size={15} />
        </span>
        <span style={{ flex: 1, fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: 'var(--c-accent-text)', letterSpacing: '0.1em' }}>WEEKLY DEBRIEF</span>
        <button
          onClick={() => void handleRegenerate()}
          disabled={regenerating || isPending || !summary}
          aria-label="Regenerate weekly summary"
          className="btn-secondary"
          style={{ minHeight: 30, padding: '4px 10px', fontSize: 11 }}
        >
          {regenerating ? 'REGENERATING…' : '↻ REGENERATE'}
        </button>
      </div>
      {isPending ? (
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted-flat)', lineHeight: 1.6, margin: 0 }}>Reading the week&apos;s signs…</p>
      ) : error ? (
        <div className="status-query-error" role="alert">
          <span>The System couldn&apos;t reach the archive — {formatError(error)}</span>
          <button className="btn-secondary" onClick={() => void refetch()}>RETRY</button>
        </div>
      ) : (
        <>
          {regenerateError && <p role="alert" style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-danger)', lineHeight: 1.5, margin: '0 0 6px' }}>{regenerateError}</p>}
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted-flat)', lineHeight: 1.6, margin: 0 }}>
            {displayed}
          </p>
          {isLong && (
            <button onClick={() => setExpanded(e => !e)} style={{
              marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-accent-text)',
            }}>
              {expanded ? 'SHOW LESS ↑' : 'READ MORE ↓'}
            </button>
          )}
        </>
      )}
    </SignaturePanel>
  );
}

function StatBar({ stat, user, isFirst, darkMode }: { stat: Stat; user: UserProfile; isFirst: boolean; darkMode: boolean }) {
  const s = user.stats[stat];
  const pct = Math.min(100, (s.xp / s.xpMax) * 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0', borderTop: isFirst ? 'none' : '1px solid var(--c-divider-flat)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatIcon stat={stat} size={13} />
        <span style={{ fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: STAT_COLORS[stat], letterSpacing: '0.08em', flex: 1 }}>{stat}</span>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>Lv.{s.level}</span>
        <span style={{ fontFamily: 'Inter', fontSize: 11, color: tintSecondaryText(STAT_COLORS[stat], darkMode) }}>{s.xp}/{s.xpMax} XP</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'var(--c-track)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: '100%', transform: `scaleX(${Math.min(1, Math.max(0, pct / 100))})`, transformOrigin: 'left', background: STAT_COLORS[stat], borderRadius: 4, transition: 'transform var(--dur-slow) var(--ease-in-out)', boxShadow: `0 0 6px ${STAT_COLORS[stat]}55` }} />
      </div>
    </div>
  );
}

export default function WebStatus({ darkMode }: Props) {
  const { user } = useEiyu();
  const { user: authUser } = useSession();
  const userId = authUser?.id;
  const [tab, setTab] = useState<'hero' | 'stats' | 'weekly'>('stats');
  const rankCfg = RANK_CONFIG[user.rank];

  const weeklyReviewQuery = useQuery({
    queryKey: ['weeklyReview', userId],
    queryFn: () => fetchWeeklyReview(userId!, user.timeZone),
    enabled: !!userId && tab === 'weekly',
  });

  const radarData = STATS.map(stat => ({
    subject: stat,
    value: user.stats[stat].level,
    fullMark: 50,
  }));

  // The chart reads the theme tokens, so it follows the theme without a JS colour table.
  const radarAccent = 'var(--c-accent)';
  const radarLabel = 'var(--c-accent-text)';
  const radarFill = 'color-mix(in srgb, var(--c-accent) 12%, transparent)';
  const gridStroke = 'var(--c-divider-flat)';

  return (
    <div className="status-layout">
        {/* Tab toggle — crisp bordered segmented control */}
        <div className="status-tabs" role="tablist" aria-label="Status views">
          {(['hero', 'stats', 'weekly'] as const).map(t => (
            <button key={t} className={t === 'hero' ? 'status-hero-tab' : undefined} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '9px 16px',
              borderRadius: 4,
              background: tab === t ? 'var(--c-accent-glass)' : 'transparent',
              border: `1px solid ${tab === t ? 'var(--c-accent-border)' : 'transparent'}`,
              fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700,
              color: tab === t ? 'var(--c-accent-text)' : 'var(--c-muted-flat)',
              letterSpacing: '0.1em', cursor: 'pointer', transition: 'background-color var(--dur-fast) ease, border-color var(--dur-fast) ease, color var(--dur-fast) ease',
            }}>
              {t === 'hero' ? 'HERO' : t === 'stats' ? 'STATS' : 'WEEKLY REVIEW'}
            </button>
          ))}
        </div>


      {/* Left panel */}
      <div className={`status-hero-panel${tab === 'hero' ? ' is-active' : ''}`} style={{ flexDirection: 'column', gap: 16 }}>
        {/* Rank badge — signature panel (redesign spec sections 3, 8.2) */}
        <SignaturePanel style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', color: 'var(--c-dim-flat)', marginBottom: 12 }}>HERO RANK</div>
          <div style={{
            width: 72, height: 72, borderRadius: 18, margin: '0 auto 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: rankCfg.bg, border: `2.5px solid ${rankCfg.color}`,
            fontFamily: 'Rajdhani', fontSize: 32, fontWeight: 700, color: rankCfg.color,
            boxShadow: `0 0 28px ${rankCfg.glow}`,
          }}>{user.rank}</div>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 15, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.08em' }}>{user.name}</div>
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-muted-flat)', marginTop: 3 }}>{user.userClass}</div>
        </SignaturePanel>

        {/* Radar chart — plain/grouping (redesign spec section 8.2: chart carries its own visual weight, no border) */}
        <div>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim-flat)', marginBottom: 8 }}>STAT OVERVIEW</div>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
              <PolarGrid stroke={gridStroke} strokeDasharray="3 3" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, fill: radarLabel, letterSpacing: '0.1em' }}
              />
              <Radar name="Stats" dataKey="value" stroke={radarAccent} fill={radarFill} strokeWidth={2} dot={{ r: 3, fill: radarAccent }} />
              <Tooltip
                contentStyle={{ background: 'var(--c-modal)', border: '1px solid var(--c-panel-border)', borderRadius: 4, fontFamily: 'JetBrains Mono', fontSize: 13, color: 'var(--c-text)' }}
                formatter={(v: unknown) => [`Lv.${v}`, 'Level']}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Right panel */}
      <div className={`status-content${tab === 'hero' ? ' is-hidden' : ''}`} style={{ flexDirection: 'column', gap: 16 }}>
        {tab === 'stats' && (
          <div>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim-flat)', marginBottom: 6 }}>ATTRIBUTE PROGRESS</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {STATS.map((stat, i) => <StatBar key={stat} stat={stat} user={user} isFirst={i === 0} darkMode={darkMode} />)}
            </div>
          </div>
        )}

        {tab === 'stats' && <WebHeatmap userId={userId} timeZone={user.timeZone} />}

        {tab === 'weekly' && (
          <>
            <div>
              <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim-flat)', marginBottom: 14 }}>LAST 7 DAYS</div>
              {weeklyReviewQuery.isPending ? (
                <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-dim-flat)', padding: '12px 0' }}>Reading the week…</div>
              ) : weeklyReviewQuery.error ? (
                <div className="status-query-error" role="alert">
                  <span>{WEEKLY_REVIEW_COPY.error}</span>
                  <button className="btn-secondary" onClick={() => void weeklyReviewQuery.refetch()}>RETRY</button>
                </div>
              ) : (
                <WeeklyReviewMatrix data={weeklyReviewQuery.data ?? []} timeZone={user.timeZone} />
              )}
            </div>

            {/* AI summary — signature panel (redesign spec section 8.3) */}
            {userId && <AiSummary userId={userId} timeZone={user.timeZone} />}
          </>
        )}
      </div>
    </div>
  );
}
