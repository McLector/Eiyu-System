import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMonthHistory, heatmapCellState, monthCells, toDateKey } from '@eiyu/shared';
import { StarIcon } from '../Icons';

interface Props {
  userId: string | undefined;
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** GitHub-commit-style weekly heatmap for the current UTC month (Slice 8, web parity for Slice 6). */
export default function WebHeatmap({ userId }: Props) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const todayKey = toDateKey(now);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ['monthHistory', userId, year, month],
    queryFn: () => fetchMonthHistory(userId!, year, month),
    enabled: !!userId,
  });

  const data = historyQuery.data ?? {};
  const cells = monthCells(year, month);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const selected = selectedDate ? data[selectedDate] : undefined;

  return (
    <div>
      <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim-flat)', marginBottom: 16 }}>
        THIS MONTH
      </div>
      {historyQuery.error ? (
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: '#f87171' }}>Couldn&apos;t load heatmap.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 22px)', gap: 3, marginBottom: 4 }}>
            {WEEKDAY_LABELS.map((label, i) => (
              <div key={i} style={{ textAlign: 'center', fontFamily: 'Rajdhani', fontSize: 10, fontWeight: 600, color: 'var(--c-dim-flat)', letterSpacing: '0.06em' }}>
                {label}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 22px)', gap: 3, marginBottom: 4 }}>
              {week.map((dateKey, di) => {
                if (dateKey === null) return <div key={di} />;
                const day = data[dateKey];
                const state = heatmapCellState(dateKey, todayKey, day);
                const isSelected = dateKey === selectedDate;
                return (
                  <button
                    key={di}
                    type="button"
                    onClick={() => setSelectedDate(dateKey)}
                    disabled={state.isFuture || historyQuery.isPending}
                    style={{
                      aspectRatio: '1',
                      border: isSelected ? '1.5px solid var(--c-accent-strong)' : '1px solid transparent',
                      borderRadius: 4,
                      background: 'none',
                      padding: 0,
                      cursor: state.isFuture ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {state.isStar ? (
                      <span style={{ display: 'flex', animation: 'heatmapGlow 0.9s ease-in-out infinite alternate' }}>
                        <StarIcon color="var(--c-accent)" size={14} />
                      </span>
                    ) : (
                      <div
                        style={{
                          width: '70%',
                          height: '70%',
                          borderRadius: 3,
                          background: 'var(--c-accent)',
                          opacity: state.isFuture ? 0 : 0.12 + state.ratio * 0.88,
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--c-divider-flat)', marginTop: 12, paddingTop: 12 }}>
            {historyQuery.isPending ? (
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim-flat)' }}>Loading…</div>
            ) : !selected ? (
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim-flat)' }}>Click a day to see details.</div>
            ) : (
              <>
                <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--c-muted-flat)', marginBottom: 6 }}>
                  {selectedDate === todayKey ? 'TODAY' : selectedDate} · {selected.completedCount}/{selected.scheduledCount}
                </div>
                {selected.completions.length === 0 ? (
                  <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim-flat)' }}>Nothing completed this day.</div>
                ) : (
                  selected.completions.map((c, i) => (
                    <div key={i} style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-text)', padding: '2px 0' }}>
                      {c.habitName}
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
