import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';

import { GlassView } from '@/components/eiyu/glass-view';
import { StarIcon } from '@/components/eiyu/icons';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import {
  addUtcDays,
  accountDateKey,
  fetchHistoryRange,
  formatError,
  heatmapCellState,
  heatmapMonthLabels,
  heatmapWeekColumns,
  heatmapWindowStart,
  HistoryByDate,
  toDateKey,
} from '@eiyu/shared';

const MONTHS_BACK = 6;
const CELL_SIZE = 13;
const CELL_GAP = 3;
const MONTH_LABEL_HEIGHT = 16;
const WEEKDAY_ROW_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

interface Props {
  userId: string | undefined;
}

function GlowingStar({ color, size = 10 }: { color: string; size?: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.6 + pulse.value * 0.4,
    transform: [{ scale: 0.88 + pulse.value * 0.18 }],
  }));
  return (
    <Animated.View style={style}>
      <StarIcon color={color} size={size} />
    </Animated.View>
  );
}

/** GitHub-style 6-month contribution graph for the Status tab. Self-contained: fetches its own data. */
export default function HabitHeatmap({ userId }: Props) {
  const { theme, user } = useEiyu();
  const [data, setData] = useState<HistoryByDate>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const now = new Date();
  const todayKey = accountDateKey(now, user.timeZone);
  const calendarToday = new Date(`${todayKey}T00:00:00.000Z`);
  const start = heatmapWindowStart(MONTHS_BACK, calendarToday);
  const end = addUtcDays(calendarToday, 1);
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);

  // Fetches history for the current userId/window. Re-created only when the
  // userId or the (string, stable-across-renders) window keys change, so both
  // the mount effect below and the focus-triggered refetch (which re-runs this
  // same fetch whenever the Status tab regains focus, since Expo Router keeps
  // this screen mounted across tab switches) stay in sync with a single
  // implementation. Depending on the primitive date keys rather than the Date
  // objects themselves avoids recreating this callback (and refetching) on
  // every render just because `new Date()` produces a new object identity.
  const fetchHistory = useCallback(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHistoryRange(userId, start, end)
      .then(d => {
        if (!cancelled) setData(d);
      })
      .catch(err => {
        if (!cancelled) setError(formatError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, startKey, endKey]);

  useEffect(() => {
    return fetchHistory();
  }, [fetchHistory]);

  // Re-fetch whenever the Status tab regains focus, so a habit completed on
  // another tab is reflected here without waiting for the window to change.
  useFocusEffect(fetchHistory);

  const columns = heatmapWeekColumns(start, end);
  const monthLabels = heatmapMonthLabels(columns);
  const gridWidth = columns.length * (CELL_SIZE + CELL_GAP);
  const selected = selectedDate ? data[selectedDate] : undefined;

  return (
    <GlassView style={styles.card}>
      <Text style={[styles.title, { color: theme.text, fontFamily: fonts.display }]}>LAST 6 MONTHS</Text>
      {error ? (
        <Text style={[styles.emptyText, { color: '#f87171' }]}>Couldn&apos;t load heatmap: {error}</Text>
      ) : (
        <>
          <View style={styles.gridRow}>
            <View style={[styles.weekdayColumn, { paddingTop: MONTH_LABEL_HEIGHT }]}>
              {WEEKDAY_ROW_LABELS.map((label, i) => (
                <View key={i} style={styles.weekdayCell}>
                  <Text style={[styles.weekdayLabel, { color: theme.dim, fontFamily: fonts.display }]}>{label}</Text>
                </View>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={[styles.monthLabelRow, { width: gridWidth }]}>
                  {monthLabels.map(({ columnIndex, label }) => (
                    <Text
                      key={columnIndex}
                      style={[
                        styles.monthLabel,
                        { left: columnIndex * (CELL_SIZE + CELL_GAP), color: theme.dim, fontFamily: fonts.display },
                      ]}>
                      {label}
                    </Text>
                  ))}
                </View>
                <View style={styles.columnsRow}>
                  {columns.map((column, ci) => (
                    <View key={ci} style={styles.weekColumn}>
                      {column.map((dateKey, ri) => {
                        if (dateKey === null) return <View key={ri} style={styles.cell} />;
                        const day = data[dateKey];
                        const state = heatmapCellState(dateKey, todayKey, day);
                        const isSelected = dateKey === selectedDate;
                        return (
                          <Pressable
                            key={ri}
                            disabled={state.isFuture || loading}
                            onPress={() => setSelectedDate(dateKey)}
                            style={styles.cell}>
                            <View
                              style={[
                                styles.dot,
                                isSelected && { borderColor: theme.accentStrong, borderWidth: 1.5 },
                                !state.isStar && {
                                  backgroundColor: theme.accent,
                                  opacity: state.isFuture ? 0 : 0.12 + state.ratio * 0.88,
                                },
                              ]}>
                              {state.isStar && <GlowingStar color={theme.accent} />}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>
          <View style={[styles.detail, { borderTopColor: theme.glassBorder }]}>
            {loading ? (
              <Text style={[styles.emptyText, { color: theme.muted }]}>Loading…</Text>
            ) : !selected ? (
              <Text style={[styles.emptyText, { color: theme.muted }]}>Tap a day to see details.</Text>
            ) : (
              <>
                <Text style={[styles.detailTitle, { color: theme.muted, fontFamily: fonts.display }]}>
                  {selectedDate === todayKey ? 'TODAY' : selectedDate} · {selected.completedCount}/{selected.scheduledCount}
                </Text>
                {selected.completions.length === 0 ? (
                  <Text style={[styles.emptyText, { color: theme.muted }]}>Nothing completed this day.</Text>
                ) : (
                  selected.completions.map((c, i) => (
                    <Text key={i} style={[styles.completionName, { color: theme.text, fontFamily: fonts.body }]}>
                      {c.habitName}
                    </Text>
                  ))
                )}
              </>
            )}
          </View>
        </>
      )}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  gridRow: {
    flexDirection: 'row',
  },
  weekdayColumn: {
    marginRight: 6,
  },
  weekdayCell: {
    height: CELL_SIZE + CELL_GAP,
    justifyContent: 'center',
  },
  weekdayLabel: {
    fontSize: 9,
    letterSpacing: 0.5,
  },
  monthLabelRow: {
    height: MONTH_LABEL_HEIGHT,
    position: 'relative',
  },
  monthLabel: {
    position: 'absolute',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  columnsRow: {
    flexDirection: 'row',
  },
  weekColumn: {
    marginRight: CELL_GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    marginBottom: CELL_GAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: CELL_SIZE - 2,
    height: CELL_SIZE - 2,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detail: {
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 12,
    gap: 4,
  },
  detailTitle: {
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 12,
    paddingVertical: 4,
  },
  completionName: {
    fontSize: 13,
    paddingVertical: 2,
  },
});
