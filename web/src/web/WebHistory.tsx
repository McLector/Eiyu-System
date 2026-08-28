import { useState } from 'react';

interface Props { onClose: () => void; }

const DAYS_HEADER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Mock completion data for August 2026
const COMPLETIONS: Record<number, 'full' | 'partial' | null> = {
  1: 'full', 2: 'full', 3: 'partial', 4: 'full', 5: 'full', 6: null, 7: null,
  8: 'full', 9: 'full', 10: 'partial', 11: 'full', 12: 'full', 13: 'full', 14: null,
  15: 'full', 16: 'full', 17: 'partial', 18: 'full', 19: 'full', 20: 'full', 21: null,
  22: 'full', 23: 'full', 24: 'full', 25: 'partial', 26: 'full', 27: 'full', 28: 'full',
};

const TODAY_QUESTS = [
  { name: 'Morning run (5 km)', xp: 20, kind: 'full' },
  { name: 'Meditate 15 minutes', xp: 20, kind: 'full' },
  { name: 'Code for 2 hours', xp: 20, kind: 'full' },
];

export default function WebHistory({ onClose }: Props) {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(7); // 0-indexed, 7 = Aug

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today = 28; // Aug 28, 2026

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'var(--c-overlay)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--c-modal)', border: '1px solid var(--c-glass-border)',
        borderRadius: 20, width: '100%', maxWidth: 440,
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'Rajdhani', fontSize: 20, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.06em', margin: 0 }}>HISTORY</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-dim)', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '16px 24px 24px' }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-muted)', fontSize: 18, padding: '4px 8px' }}>‹</button>
            <span style={{ fontFamily: 'Rajdhani', fontSize: 15, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.08em' }}>
              {monthNames[month].toUpperCase()} {year}
            </span>
            <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-muted)', fontSize: 18, padding: '4px 8px' }}>›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
            {DAYS_HEADER.map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, color: 'var(--c-dim)', letterSpacing: '0.08em', padding: '4px 0' }}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 20 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const completion = month === 7 ? COMPLETIONS[day] : null;
              const isToday = month === 7 && day === today;
              return (
                <div key={i} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '6px 2px',
                  borderRadius: 8,
                  background: isToday ? 'var(--c-accent-glass)' : 'transparent',
                  border: isToday ? '1px solid var(--c-accent-border)' : '1px solid transparent',
                }}>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: isToday ? 'var(--c-accent)' : 'var(--c-text)' }}>{day}</span>
                  {completion && (
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: completion === 'full' ? '#4ade80' : '#fbbf24',
                      boxShadow: `0 0 4px ${completion === 'full' ? '#4ade8080' : '#fbbf2480'}`,
                    }} />
                  )}
                  {!completion && <div style={{ width: 6, height: 6 }} />}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            {[['#4ade80', 'Full completion'], ['#fbbf24', 'Partial / easy']].map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color as string }} />
                <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-muted)' }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Today's completions */}
          <div style={{ borderTop: '1px solid var(--c-glass-border)', paddingTop: 16 }}>
            <p style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', color: 'var(--c-dim)', marginBottom: 10 }}>TODAY</p>
            {TODAY_QUESTS.map((q, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i > 0 ? '1px solid var(--c-glass-border)' : 'none' }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, background: 'rgba(74,222,128,0.15)', border: '1.5px solid rgba(74,222,128,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <span style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-text)', flex: 1 }}>{q.name}</span>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: '#4ade80', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 5, padding: '2px 6px' }}>+{q.xp} XP</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
