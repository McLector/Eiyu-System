import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { STATS, STAT_COLORS, type WeeklyDayDatum } from '@eiyu/shared';

import { WEEKLY_LABEL_WIDTH, weeklyColumnWidth } from '@/lib/weekly-columns';

interface Props {
  data: WeeklyDayDatum[];
  colors: {
    text: string;
    muted: string;
    accent: string;
    track: string;
  };
}

function formatDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

/** Day of the month without a leading zero: `2026-12-05` -> `5`. */
function dayOfMonth(dateKey: string): string {
  return String(Number(dateKey.split('-')[2]));
}

export default function WeeklyReviewMatrix({ data, colors }: Props) {
  const maxValue = Math.max(1, ...data.flatMap(day => STATS.map(stat => day[stat])));
  // Until the matrix is measured the day columns share the width equally; afterwards the helper pins them, rounded down.
  const [width, setWidth] = useState<number | null>(null);
  const column = width === null ? null : weeklyColumnWidth(width, data.length || undefined);
  const dayCell = column ? { width: column } : styles.flexCell;
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View testID="weekly-matrix" onLayout={onLayout} style={styles.table}>
      <View style={styles.row}>
        <View style={[styles.statHeader, { borderBottomColor: colors.track }]}>
          <Text numberOfLines={1} style={[styles.headerText, { color: colors.muted }]}>STAT</Text>
        </View>
        {data.map(day => (
          <View
            key={day.dateKey}
            accessible
            accessibilityLabel={`${day.day}, ${formatDateKey(day.dateKey)}`}
            style={[styles.headerCell, dayCell, { borderBottomColor: colors.track }]}
          >
            <Text numberOfLines={1} style={[styles.headerDay, { color: colors.accent }]}>{day.day.slice(0, 2)}</Text>
            <Text numberOfLines={1} style={[styles.headerDate, { color: colors.muted }]}>{dayOfMonth(day.dateKey)}</Text>
          </View>
        ))}
      </View>
      {STATS.map(stat => (
        <View key={stat} style={styles.row}>
          <View style={[styles.statHeader, { borderBottomColor: colors.track }]}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.statText, { color: STAT_COLORS[stat] }]}>{stat}</Text>
          </View>
          {data.map(day => {
            const value = day[stat];
            const intensity = value / maxValue;
            return (
              <View
                key={`${stat}-${day.dateKey}`}
                accessible
                accessibilityLabel={`${stat}, ${day.day}, ${formatDateKey(day.dateKey)}: ${value} completions`}
                style={[
                  styles.valueCell,
                  dayCell,
                  {
                    backgroundColor: `${STAT_COLORS[stat]}${Math.max(0x18, Math.min(0xcc, Math.round(0x18 + intensity * 0x88))).toString(16).padStart(2, '0')}`,
                    borderBottomColor: colors.track,
                  },
                ]}
              >
                <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.valueText, { color: colors.text }]}>{value}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
  },
  flexCell: {
    flex: 1,
  },
  statHeader: {
    width: WEEKLY_LABEL_WIDTH,
    minHeight: 56,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCell: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  valueCell: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  headerDay: {
    fontSize: 11,
    fontWeight: '700',
  },
  headerDate: {
    fontSize: 11,
    marginTop: 2,
  },
  statText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  valueText: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 12,
    textAlign: 'center',
  },
});
