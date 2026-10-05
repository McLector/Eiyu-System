import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import {
  accountDateKey, addUtcDays, fetchHistoryRange, heatmapCellState, heatmapMonthLabels, heatmapWeekColumns, heatmapWindowStart,
  toDateKey, type HistoryByDate,
} from '@eiyu/shared';

import { StarIcon } from '@/components/eiyu/icons';
import { Sheet } from '@/components/ui/sheet';
import { StateBlock } from '@/components/ui/state-block';
import { useReducedMotion } from '@/components/ui/use-reduced-motion';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

const MONTHS_BACK = 6;
const CELL_SIZE = 13;
const CELL_GAP = 3;
const MONTH_LABEL_HEIGHT = 16;
const WEEKDAY_ROW_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

interface Props {
  userId: string | undefined;
  timeZone: string;
}

function GlowingStar({ color, size = 10 }: { color: string; size?: number }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [pulse, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: reduced ? 1 : 0.6 + pulse.value * 0.4,
    transform: [{ scale: reduced ? 1 : 0.88 + pulse.value * 0.18 }],
  }));
  return (
    <Animated.View style={style}>
      <StarIcon color={color} size={size} />
    </Animated.View>
  );
}

/** The six-month contribution graph. It reads its own history, opens on the latest month and shows a pressed day in a sheet. */
export default function HabitHeatmap({ userId, timeZone }: Props) {
  const t = useTokens();
  const [data, setData] = useState<HistoryByDate>({});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const userStartedScrolling = useRef(false);
  const autoScrolled = useRef(false);
  const previousWindow = useRef('');

  const todayKey = accountDateKey(new Date(), timeZone);
  const calendarToday = new Date(`${todayKey}T00:00:00.000Z`);
  const start = heatmapWindowStart(MONTHS_BACK, calendarToday);
  const end = addUtcDays(calendarToday, 1);
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  const windowKey = `${startKey}:${endKey}`;

  useEffect(() => {
    if (previousWindow.current === windowKey) return;
    previousWindow.current = windowKey;
    if (!userStartedScrolling.current) autoScrolled.current = false;
  }, [windowKey]);

  const scrollToLatest = () => {
    if (userStartedScrolling.current || autoScrolled.current) return;
    autoScrolled.current = true;
    scrollRef.current?.scrollToEnd({ animated: false });
  };

  // One fetch for both the mount effect and the focus refetch (Expo Router keeps this screen mounted across tab switches, so a
  // quest completed on another tab shows up when Status regains focus). It depends on the primitive window keys, not the Date
  // objects, so it is not recreated on every render.
  const fetchHistory = useCallback(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchHistoryRange(userId, start, end)
      .then(result => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, startKey, endKey, attempt]);

  useEffect(() => fetchHistory(), [fetchHistory]);
  useFocusEffect(fetchHistory);

  const columns = heatmapWeekColumns(start, end);
  const monthLabels = heatmapMonthLabels(columns);
  const gridWidth = columns.length * (CELL_SIZE + CELL_GAP);
  const selected = selectedDate ? data[selectedDate] : undefined;

  return (
    <View>
      <Text style={[styles.title, { color: t['dim-flat'], fontFamily: fonts.display }]}>LAST 6 MONTHS</Text>
      {failed ? (
        <StateBlock kind="error" onRetry={() => setAttempt(n => n + 1)}>The System couldn&apos;t load the heatmap.</StateBlock>
      ) : (
        <>
          <View style={styles.gridRow}>
            <View style={[styles.weekdayColumn, { paddingTop: MONTH_LABEL_HEIGHT }]}>
              {WEEKDAY_ROW_LABELS.map((label, i) => (
                <View key={i} style={styles.weekdayCell}>
                  <Text style={[styles.weekdayLabel, { color: t['dim-flat'], fontFamily: fonts.display }]}>{label}</Text>
                </View>
              ))}
            </View>
            <ScrollView
              ref={scrollRef}
              testID="status-heatmap-scroll"
              horizontal
              showsHorizontalScrollIndicator={false}
              onContentSizeChange={scrollToLatest}
              onScrollBeginDrag={() => { userStartedScrolling.current = true; }}>
              <View>
                <View style={[styles.monthLabelRow, { width: gridWidth }]}>
                  {monthLabels.map(({ columnIndex, label }) => (
                    <Text
                      key={columnIndex}
                      style={[styles.monthLabel, { left: columnIndex * (CELL_SIZE + CELL_GAP), color: t['dim-flat'], fontFamily: fonts.display }]}>
                      {label}
                    </Text>
                  ))}
                </View>
                <View style={styles.columnsRow}>
                  {columns.map((column, ci) => (
                    <View key={ci} style={styles.weekColumn}>
                      {column.map((dateKey, ri) => {
                        if (dateKey === null) return <View key={ri} style={styles.cell} />;
                        const state = heatmapCellState(dateKey, todayKey, data[dateKey]);
                        const isSelected = dateKey === selectedDate;
                        return (
                          <Pressable
                            key={ri}
                            testID={dateKey === todayKey ? 'status-heatmap-today' : undefined}
                            accessibilityRole="button"
                            accessibilityLabel={dateKey === todayKey ? `Today, ${dateKey}` : `History for ${dateKey}`}
                            disabled={state.isFuture}
                            onPress={() => setSelectedDate(dateKey)}
                            style={styles.cell}>
                            <View
                              style={[
                                styles.dot,
                                isSelected && { borderColor: t['accent-border'], borderWidth: 1.5 },
                                !state.isStar && { backgroundColor: t.accent, opacity: state.isFuture ? 0 : 0.12 + state.ratio * 0.88 },
                              ]}>
                              {state.isStar && <GlowingStar color={t.accent} />}
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
          {loading ? <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: t['dim-flat'], fontFamily: fonts.body }]}>Loading…</Text> : null}
        </>
      )}

      <Sheet visible={selectedDate !== null} title={selectedDate === todayKey ? 'TODAY' : selectedDate ?? ''} closeLabel="Close day details" onClose={() => setSelectedDate(null)} testID="heatmap-day-sheet">
        {selected ? (
          <Text style={[styles.count, { color: t['muted-flat'], fontFamily: fonts.display }]}>{`${selected.completedCount}/${selected.scheduledCount} completed`}</Text>
        ) : null}
        {loading ? (
          <Text style={[styles.caption, { color: t['dim-flat'], fontFamily: fonts.body }]}>Loading…</Text>
        ) : !selected || selected.completions.length === 0 ? (
          <Text style={[styles.caption, { color: t['dim-flat'], fontFamily: fonts.body }]}>Nothing completed this day.</Text>
        ) : (
          selected.completions.map((completion, i) => (
            <Text key={i} style={[styles.completion, { color: t.text, fontFamily: fonts.body }]}>{completion.habitName}</Text>
          ))
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 11, letterSpacing: 1.4, marginBottom: 8 },
  gridRow: { flexDirection: 'row' },
  weekdayColumn: { marginRight: 6 },
  weekdayCell: { height: CELL_SIZE + CELL_GAP, justifyContent: 'center' },
  weekdayLabel: { fontSize: 9, letterSpacing: 0.5 },
  monthLabelRow: { height: MONTH_LABEL_HEIGHT, position: 'relative' },
  monthLabel: { position: 'absolute', fontSize: 10, letterSpacing: 0.5 },
  columnsRow: { flexDirection: 'row' },
  weekColumn: { marginRight: CELL_GAP },
  cell: { width: CELL_SIZE, height: CELL_SIZE, marginBottom: CELL_GAP, alignItems: 'center', justifyContent: 'center' },
  dot: { width: CELL_SIZE - 2, height: CELL_SIZE - 2, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 12, paddingVertical: 6 },
  count: { fontSize: 12, letterSpacing: 1, marginBottom: 8 },
  completion: { fontSize: 14, paddingVertical: 8 },
});
