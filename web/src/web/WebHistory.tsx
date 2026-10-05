import { useState } from 'react';
import Dialog from '../components/Dialog';
import { useQuery } from '@tanstack/react-query';
import {
  accountDateKey, fetchMonthHistory, FULL_XP, EASY_XP, historyDayKey, historyDayStatus, historyMonthCells, MONTH_NAMES, shiftHistoryMonth,
} from '@eiyu/shared';

import { CheckIcon, ChevronIcon, CompletionDotIcon } from '../Icons';
import StateBlock from '../components/StateBlock';

interface Props { userId: string; timeZone: string; onClose: () => void; }

const DAYS_HEADER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const dateKey = historyDayKey;
const dayStatus = historyDayStatus;

export function deriveAccountToday(now: Date, timeZone: string): { year: number; month: number; day: number } {
  const [year, month, day] = accountDateKey(now, timeZone).split('-').map(Number);
  return { year, month: month - 1, day };
}

export default function WebHistory({ userId, timeZone, onClose }: Props) {
  const now = new Date();
  const { year: accountYear, month: accountMonth, day: accountDay } = deriveAccountToday(now, timeZone);
  const [year, setYear] = useState(accountYear);
  const [month, setMonth] = useState(accountMonth);

  const historyQuery = useQuery({
    queryKey: ['monthHistory', userId, year, month],
    queryFn: () => fetchMonthHistory(userId, year, month),
    enabled: !!userId,
  });

  const monthNames = MONTH_NAMES;
  const today = accountDay;
  const isCurrentMonth = year === accountYear && month === accountMonth;

  const step = (delta: number) => {
    const next = shiftHistoryMonth({ year, month }, delta);
    setYear(next.year);
    setMonth(next.month);
  };
  const prevMonth = () => step(-1);
  const nextMonth = () => step(1);

  const cells = historyMonthCells(year, month);

  const data = historyQuery.data ?? {};
  const todayCompletions = isCurrentMonth ? (data[dateKey(year, month, today)]?.completions ?? []) : [];

  return (
    <Dialog title="HISTORY" onClose={onClose}>
        <div className="history-dialog-body" style={{ padding: '16px 24px 24px' }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button aria-label="Previous month" onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-muted-flat)', padding: '4px 8px', display: 'flex' }}>
              <ChevronIcon direction="left" size={16} />
            </button>
            <span aria-live="polite" style={{ fontFamily: 'Rajdhani', fontSize: 15, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.08em' }}>
              {monthNames[month].toUpperCase()} {year}
            </span>
            <button aria-label="Next month" onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-muted-flat)', padding: '4px 8px', display: 'flex' }}>
              <ChevronIcon direction="right" size={16} />
            </button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
            {DAYS_HEADER.map((d, i) => (
              <div key={i} role="columnheader" aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]} style={{ textAlign: 'center', fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, color: 'var(--c-dim-flat)', letterSpacing: '0.08em', padding: '4px 0' }}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          {historyQuery.isPending ? (
            <StateBlock kind="loading">Reading the record…</StateBlock>
          ) : historyQuery.error ? (
            <StateBlock kind="error" retryLabel="RETRY" onRetry={() => void historyQuery.refetch()}>The System couldn&apos;t pull this month&apos;s record. Try again in a moment.</StateBlock>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 20 }}>
              {cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const completion = dayStatus(data[dateKey(year, month, day)]?.completions);
                const isToday = isCurrentMonth && day === today;
                return (
                  <div key={i} role="gridcell" aria-label={`${dateKey(year, month, day)}: ${completion === 'full' ? 'full completion' : completion === 'partial' ? 'penalty' : 'no completion'}`} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    padding: '6px 2px',
                    borderRadius: 8,
                    background: isToday ? 'var(--c-accent-glass)' : 'transparent',
                    border: isToday ? '1px solid var(--c-accent-border)' : '1px solid transparent',
                  }}>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: isToday ? 'var(--c-accent-text)' : 'var(--c-text)' }}>{day}</span>
                    {completion ? (
                      <CompletionDotIcon color={completion === 'full' ? 'var(--c-success)' : 'var(--c-warning)'} size={8} />
                    ) : (
                      <div style={{ width: 8, height: 8 }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            {[['var(--c-success)', 'Full completion'], ['var(--c-warning)', 'Penalty']].map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CompletionDotIcon color={color as string} size={8} />
                <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-muted-flat)' }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Today's completions */}
          <div style={{ borderTop: '1px solid var(--c-divider-flat)', paddingTop: 16 }}>
            <p style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', color: 'var(--c-dim-flat)', marginBottom: 10 }}>TODAY</p>
            {!isCurrentMonth ? (
              <p style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim-flat)' }}>Step back to the current month to see today&apos;s completions.</p>
            ) : todayCompletions.length === 0 ? (
              <p style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim-flat)' }}>Nothing completed yet today.</p>
            ) : (
              todayCompletions.map((q, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i > 0 ? '1px solid var(--c-divider-flat)' : 'none' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--c-success-glass)', border: '1.5px solid var(--c-success-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--c-success)' }}>
                    <CheckIcon size={11} />
                  </div>
                  <span style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-text)', flex: 1 }}>{q.habitName}</span>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--c-success)', background: 'var(--c-success-glass)', border: '1px solid var(--c-success-border)', borderRadius: 5, padding: '2px 6px' }}>
                    +{q.kind === 'full' ? FULL_XP : EASY_XP} XP
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
    </Dialog>
  );
}
