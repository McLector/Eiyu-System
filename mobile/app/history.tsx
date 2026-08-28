import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CheckIcon, ChevronIcon } from '@/components/eiyu/icons';
import { Screen } from '@/components/eiyu/screen';
import { fonts } from '@/constants/eiyu-theme';
import { useAuth } from '@/contexts/auth-store';
import { useEiyu } from '@/contexts/eiyu-store';
import { toDateKey } from '@eiyu/shared';
import { formatError } from '@eiyu/shared';
import { fetchMonthHistory, HistoryByDate } from '@eiyu/shared';

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export default function HistoryScreen() {
  const { theme } = useEiyu();
  const { session } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getUTCFullYear());
  const [month, setMonth] = useState(today.getUTCMonth());
  const [selectedDate, setSelectedDate] = useState(toDateKey(today));
  const [data, setData] = useState<HistoryByDate>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
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
  }, [session?.user.id, year, month]);

  const changeMonth = (delta: number) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    setMonth(newMonth);
    setYear(newYear);
  };

  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const totalDays = daysInMonth(year, month);
  const todayKey = toDateKey(today);

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedCompletions = data[selectedDate] ?? [];

  return (
    <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
      <View style={[styles.sheet, { backgroundColor: theme.modal, borderColor: theme.glassBorder }]}>
        <View style={[styles.handle, { backgroundColor: theme.accentBorder }]} />
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: theme.text, fontFamily: fonts.display }]}>HISTORY</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.closeX, { color: theme.dim }]}>×</Text>
          </Pressable>
        </View>

        <Screen edges={[]} fill={false}>
          <View style={styles.monthRow}>
            <Pressable
              testID="history-prev-month"
              onPress={() => changeMonth(-1)}
              style={styles.monthNavButton}>
              <ChevronIcon direction="left" size={16} color={theme.muted} />
            </Pressable>
            <Text style={[styles.monthLabel, { color: theme.text, fontFamily: fonts.display }]}>
              {MONTH_LABELS[month]} {year}
            </Text>
            <Pressable
              testID="history-next-month"
              onPress={() => changeMonth(1)}
              style={styles.monthNavButton}>
              <ChevronIcon direction="right" size={16} color={theme.muted} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, i) => (
              <Text key={i} style={[styles.weekdayLabel, { color: theme.dim, fontFamily: fonts.display }]}>
                {label}
              </Text>
            ))}
          </View>

          {error ? (
            <Text style={[styles.emptyText, { color: '#f87171' }]}>Couldn&apos;t load history: {error}</Text>
          ) : (
            <View style={styles.grid}>
              {cells.map((day, i) => {
                if (day === null) return <View key={i} style={styles.dayCell} />;
                const dateKey = toDateKey(new Date(Date.UTC(year, month, day)));
                const hasCompletions = (data[dateKey]?.length ?? 0) > 0;
                const isSelected = dateKey === selectedDate;
                const isToday = dateKey === todayKey;
                return (
                  <Pressable key={i} style={styles.dayCell} onPress={() => setSelectedDate(dateKey)}>
                    <View
                      style={[
                        styles.dayCircle,
                        isSelected && { backgroundColor: theme.accentGlass, borderColor: theme.accentStrong, borderWidth: 1.5 },
                        !isSelected && isToday && { borderColor: theme.accentBorder, borderWidth: 1 },
                      ]}>
                      <Text
                        style={[
                          styles.dayNumber,
                          { color: isSelected ? theme.accent : theme.text, fontFamily: fonts.body },
                        ]}>
                        {day}
                      </Text>
                      {hasCompletions && (
                        <View style={[styles.dayDot, { backgroundColor: isSelected ? theme.accent : theme.muted }]} />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={[styles.detailSection, { borderTopColor: theme.glassBorder }]}>
            <Text style={[styles.detailTitle, { color: theme.muted, fontFamily: fonts.display }]}>
              {selectedDate === todayKey ? 'TODAY' : selectedDate}
            </Text>
            {loading ? (
              <Text style={[styles.emptyText, { color: theme.muted }]}>Loading…</Text>
            ) : selectedCompletions.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.muted }]}>No quests completed this day.</Text>
            ) : (
              selectedCompletions.map((c, i) => (
                <View key={i} style={styles.completionRow}>
                  <View style={[styles.completionCheck, { borderColor: 'rgba(74,222,128,0.5)', backgroundColor: 'rgba(74,222,128,0.15)' }]}>
                    <CheckIcon size={12} color="#4ade80" />
                  </View>
                  <Text style={[styles.completionName, { color: theme.text, fontFamily: fonts.body }]}>
                    {c.habitName}
                  </Text>
                  {c.kind === 'easy' && (
                    <Text style={[styles.completionKind, { color: theme.dim, fontFamily: fonts.body }]}>easy</Text>
                  )}
                </View>
              ))
            )}
          </View>
        </Screen>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    maxHeight: '88%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    letterSpacing: 1,
  },
  closeX: {
    fontSize: 22,
    lineHeight: 22,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 16,
  },
  monthNavButton: {
    padding: 6,
  },
  monthLabel: {
    fontSize: 16,
    letterSpacing: 1,
    minWidth: 160,
    textAlign: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    fontSize: 13,
  },
  dayDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  detailSection: {
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 16,
    gap: 4,
  },
  detailTitle: {
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    paddingVertical: 8,
  },
  completionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  completionCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionName: {
    fontSize: 14,
    flex: 1,
  },
  completionKind: {
    fontSize: 11,
    fontStyle: 'italic',
  },
});
