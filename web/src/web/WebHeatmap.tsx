import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addUtcDays,
  accountDateKey,
  fetchHistoryRange,
  heatmapCellState,
  heatmapMonthLabels,
  heatmapWeekColumns,
  heatmapWindowStart,
  toDateKey,
} from '@eiyu/shared';
import { StarIcon } from '../Icons';

interface Props {
  userId: string | undefined;
  timeZone: string;
}

const MONTHS_BACK = 6;
const CELL_SIZE = 13;
const CELL_GAP = 3;
const MONTH_LABEL_HEIGHT = 16;
const WEEKDAY_ROW_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

/** GitHub-style 6-month contribution graph for the Status screen. */
export default function WebHeatmap({ userId, timeZone }: Props) {
  const now = new Date();
  const todayKey = accountDateKey(now, timeZone);
  const calendarToday = new Date(`${todayKey}T00:00:00.000Z`);
  const start = heatmapWindowStart(MONTHS_BACK, calendarToday);
  const end = addUtcDays(calendarToday, 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ['historyRange', userId, toDateKey(start), toDateKey(end)],
    queryFn: () => fetchHistoryRange(userId!, start, end),
    enabled: !!userId,
  });

  const data = historyQuery.data ?? {};
  const columns = heatmapWeekColumns(start, end);
  const monthLabels = heatmapMonthLabels(columns);
  const selected = selectedDate ? data[selectedDate] : undefined;
  const gridWidth = columns.length * (CELL_SIZE + CELL_GAP);

  return (
    <div>
      <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim-flat)', marginBottom: 16 }}>
        LAST 6 MONTHS
      </div>
      {historyQuery.error ? (
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: '#f87171' }}>The archive didn&apos;t respond.</div>
      ) : (
        <>
          <div style={{ display: 'flex' }}>
            <div style={{ display: 'flex', flexDirection: 'column', paddingTop: MONTH_LABEL_HEIGHT, marginRight: 6 }}>
              {WEEKDAY_ROW_LABELS.map((label, i) => (
                <div
                  key={i}
                  style={{
                    height: CELL_SIZE + CELL_GAP,
                    display: 'flex',
                    alignItems: 'center',
                    fontFamily: 'Rajdhani',
                    fontSize: 9,
                    fontWeight: 600,
                    color: 'var(--c-dim-flat)',
                  }}>
                  {label}
                </div>
              ))}
            </div>
            <div style={{ overflowX: 'auto', flex: 1, minWidth: 0 }}>
              <div style={{ position: 'relative', height: MONTH_LABEL_HEIGHT, width: gridWidth }}>
                {monthLabels.map(({ columnIndex, label }) => (
                  <div
                    key={columnIndex}
                    style={{
                      position: 'absolute',
                      left: columnIndex * (CELL_SIZE + CELL_GAP),
                      fontFamily: 'Rajdhani',
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--c-dim-flat)',
                    }}>
                    {label}
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridAutoFlow: 'column',
                  gridTemplateRows: `repeat(7, ${CELL_SIZE}px)`,
                  gridAutoColumns: `${CELL_SIZE}px`,
                  gap: CELL_GAP,
                }}>
                {columns.map((column, ci) =>
                  column.map((dateKey, ri) => {
                    if (dateKey === null) return <div key={`${ci}-${ri}`} />;
                    const day = data[dateKey];
                    const state = heatmapCellState(dateKey, todayKey, day);
                    const isSelected = dateKey === selectedDate;
                    return (
                      <button
                        key={`${ci}-${ri}`}
                        type="button"
                        onClick={() => setSelectedDate(dateKey)}
                        disabled={state.isFuture || historyQuery.isPending}
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          border: isSelected ? '1.5px solid var(--c-accent-strong)' : '1px solid transparent',
                          borderRadius: 3,
                          background: 'none',
                          padding: 0,
                          cursor: state.isFuture ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        {state.isStar ? (
                          <span className="heatmap-glow" style={{ display: 'flex' }}>
                            <StarIcon color="var(--c-accent)" size={9} />
                          </span>
                        ) : (
                          <div
                            style={{
                              width: '80%',
                              height: '80%',
                              borderRadius: 2,
                              background: 'var(--c-accent)',
                              opacity: state.isFuture ? 0 : 0.12 + state.ratio * 0.88,
                            }}
                          />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--c-divider-flat)', marginTop: 12, paddingTop: 12 }}>
            {historyQuery.isPending ? (
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim-flat)' }}>Reading the archive…</div>
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
