import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  accountDateKey, EASY_XP, FULL_XP, fetchMonthHistory, historyDayKey, historyDayStatus, historyMonthCells,
  MONTH_NAMES, shiftHistoryMonth, type HistoryByDate, type HistoryMonth,
} from '@eiyu/shared';

import { CheckIcon, ChevronIcon, CompletionDotIcon } from '@/components/eiyu/icons';
import { Sheet } from '@/components/ui/sheet';
import { StateBlock } from '@/components/ui/state-block';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

const WEEKDAYS = [
  { short: 'S', full: 'Sunday' }, { short: 'M', full: 'Monday' }, { short: 'T', full: 'Tuesday' }, { short: 'W', full: 'Wednesday' },
  { short: 'T', full: 'Thursday' }, { short: 'F', full: 'Friday' }, { short: 'S', full: 'Saturday' },
];

interface Props {
  visible: boolean;
  userId: string | undefined;
  timeZone: string;
  onClose: () => void;
}

/** The month calendar of past completions: full and penalty dots, month stepping, and the day's list underneath. */
export function HistorySheet({ visible, userId, timeZone, onClose }: Props) {
  const t = useTokens();
  const todayKey = accountDateKey(new Date(), timeZone);
  const [todayYear, todayMonth] = todayKey.split('-').map(Number);
  const [shown, setShown] = useState<HistoryMonth>({ year: todayYear, month: todayMonth - 1 });
  const [selected, setSelected] = useState(todayKey);
  const [data, setData] = useState<HistoryByDate>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!visible || !userId) return;
    let cancelled = false;
    setStatus('loading');
    fetchMonthHistory(userId, shown.year, shown.month)
      .then(result => { if (!cancelled) { setData(result); setStatus('ready'); } })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [visible, userId, shown.year, shown.month, attempt]);

  const step = (delta: number) => setShown(current => shiftHistoryMonth(current, delta));
  const cells = historyMonthCells(shown.year, shown.month);
  const completions = data[selected]?.completions ?? [];

  return (
    <Sheet visible={visible} title="HISTORY" closeLabel="Close History" onClose={onClose} testID="history-sheet">
      <View style={styles.monthRow}>
        <Pressable testID="history-prev-month" accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => step(-1)} style={styles.monthButton}>
          <ChevronIcon direction="left" size={16} color={t['muted-flat']} />
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={[styles.monthLabel, { color: t.text, fontFamily: fonts.display }]}>
          {`${MONTH_NAMES[shown.month].toUpperCase()} ${shown.year}`}
        </Text>
        <Pressable testID="history-next-month" accessibilityRole="button" accessibilityLabel="Next month" onPress={() => step(1)} style={styles.monthButton}>
          <ChevronIcon direction="right" size={16} color={t['muted-flat']} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((weekday, i) => (
          <Text key={i} accessibilityLabel={weekday.full} style={[styles.weekday, { color: t['dim-flat'], fontFamily: fonts.display }]}>{weekday.short}</Text>
        ))}
      </View>

      {status === 'loading' ? (
        <StateBlock kind="loading">Reading the record…</StateBlock>
      ) : status === 'error' ? (
        <StateBlock kind="error" retryLabel="RETRY" onRetry={() => setAttempt(n => n + 1)}>
          The System couldn&apos;t pull this month&apos;s record. Try again in a moment.
        </StateBlock>
      ) : (
        <View style={styles.grid}>
          {cells.map((dayNumber, i) => {
            if (dayNumber === null) return <View key={i} style={styles.cell} />;
            const key = historyDayKey(shown.year, shown.month, dayNumber);
            const mark = historyDayStatus(data[key]?.completions);
            const isToday = key === todayKey;
            const isSelected = key === selected;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${key}: ${mark === 'full' ? 'full completion' : mark === 'partial' ? 'penalty' : 'no completion'}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => setSelected(key)}
                style={styles.cell}>
                <View
                  style={[
                    styles.day,
                    isSelected
                      ? { backgroundColor: t['accent-glass'], borderColor: t['accent-border'] }
                      : isToday ? { borderColor: t['accent-border'] } : null,
                  ]}>
                  <Text style={[styles.dayNumber, { color: isToday ? t['accent-text'] : t.text }]}>{dayNumber}</Text>
                  {mark ? <CompletionDotIcon color={mark === 'full' ? t.success : t.warning} size={8} /> : <View style={styles.dotGap} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.legend}>
        {[[t.success, 'Full completion'], [t.warning, 'Penalty']].map(([color, label]) => (
          <View key={label} style={styles.legendItem}>
            <CompletionDotIcon color={color} size={8} />
            <Text style={[styles.legendText, { color: t['muted-flat'], fontFamily: fonts.body }]}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.list, { borderTopColor: t['divider-flat'] }]}>
        <Text style={[styles.listTitle, { color: t['dim-flat'], fontFamily: fonts.display }]}>{selected === todayKey ? 'TODAY' : selected}</Text>
        {status === 'ready' && completions.length === 0 ? (
          <Text style={[styles.empty, { color: t['dim-flat'], fontFamily: fonts.body }]}>Nothing completed this day.</Text>
        ) : null}
        {completions.map((completion, i) => (
          <View key={i} style={[styles.item, i > 0 && { borderTopColor: t['divider-flat'], borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={[styles.check, { backgroundColor: t['success-glass'], borderColor: t['success-border'] }]}>
              <CheckIcon size={11} color={t.success} />
            </View>
            <Text style={[styles.itemName, { color: t.text, fontFamily: fonts.body }]}>{completion.habitName}</Text>
            <Text style={[styles.xp, { color: t.success, backgroundColor: t['success-glass'], borderColor: t['success-border'] }]}>
              {`+${completion.kind === 'full' ? FULL_XP : EASY_XP} XP`}
            </Text>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  monthButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 16, letterSpacing: 1.2 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, letterSpacing: 1, paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  day: { width: '88%', minHeight: 44, borderWidth: 1, borderColor: 'transparent', borderRadius: 4, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayNumber: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12 },
  dotGap: { width: 8, height: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 11 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 2 },
  listTitle: { fontSize: 11, letterSpacing: 1.4, marginBottom: 6 },
  empty: { fontSize: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  check: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  itemName: { flex: 1, fontSize: 13 },
  xp: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 11, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
});
