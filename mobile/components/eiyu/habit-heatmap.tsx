import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';

import { GlassView } from '@/components/eiyu/glass-view';
import { StarIcon } from '@/components/eiyu/icons';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { addUtcDays, fetchMonthHistory, formatError, HistoryByDate, toDateKey } from '@eiyu/shared';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface Props {
  userId: string | undefined;
}

function GlowingStar({ color }: { color: string }) {
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
      <StarIcon color={color} size={14} />
    </Animated.View>
  );
}

/** GitHub-commit-style weekly heatmap for the current UTC month (Slice 6). Self-contained: fetches its own data. */
export default function HabitHeatmap({ userId }: Props) {
  const { theme } = useEiyu();
  const [data, setData] = useState<HistoryByDate>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const todayKey = toDateKey(now);

  // Fetches history for the current userId/year/month. Re-created only when one of
  // those three changes, so both the mount effect below and the focus-triggered
  // refetch (which re-runs this same fetch whenever the Status tab regains focus,
  // since Expo Router keeps this screen mounted across tab switches) stay in sync
  // with a single implementation.
  const fetchHistory = useCallback(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMonthHistory(userId, year, month)
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
  }, [userId, year, month]);

  useEffect(() => {
    return fetchHistory();
  }, [fetchHistory]);

  // Re-fetch whenever the Status tab regains focus, so a habit completed on
  // another tab is reflected here without waiting for year/month to change.
  useFocusEffect(fetchHistory);

  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDateKey(addUtcDays(new Date(Date.UTC(year, month, 1)), i))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const selected = selectedDate ? data[selectedDate] : undefined;

  return (
    <GlassView style={styles.card}>
      <Text style={[styles.title, { color: theme.text, fontFamily: fonts.display }]}>THIS MONTH</Text>
      {error ? (
        <Text style={[styles.emptyText, { color: '#f87171' }]}>Couldn&apos;t load heatmap: {error}</Text>
      ) : (
        <>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, i) => (
              <Text key={i} style={[styles.weekdayLabel, { color: theme.dim, fontFamily: fonts.display }]}>
                {label}
              </Text>
            ))}
          </View>
          {weeks.map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map((dateKey, di) => {
                if (dateKey === null) return <View key={di} style={styles.cell} />;
                const isFuture = dateKey > todayKey;
                const day = data[dateKey];
                const scheduledCount = day?.scheduledCount ?? 0;
                const completedCount = day?.completedCount ?? 0;
                const ratio = scheduledCount > 0 ? completedCount / scheduledCount : 0;
                const isStar = !isFuture && scheduledCount > 0 && completedCount === scheduledCount;
                const isSelected = dateKey === selectedDate;
                return (
                  <Pressable
                    key={di}
                    disabled={isFuture || loading}
                    onPress={() => setSelectedDate(dateKey)}
                    style={styles.cell}>
                    <View
                      style={[
                        styles.dot,
                        isSelected && { borderColor: theme.accentStrong, borderWidth: 1.5 },
                        !isStar && {
                          backgroundColor: theme.accent,
                          opacity: isFuture ? 0 : 0.12 + ratio * 0.88,
                        },
                      ]}>
                      {isStar && <GlowingStar color={theme.accent} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
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
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    letterSpacing: 1,
  },
  weekRow: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 4,
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
