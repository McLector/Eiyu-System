import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { STATS, STAT_COLORS, type WeeklyDayDatum } from '@eiyu/shared';

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

export default function WeeklyReviewMatrix({ data, colors }: Props) {
  const maxValue = Math.max(1, ...data.flatMap(day => STATS.map(stat => day[stat])));

  return (
    <View accessible accessibilityLabel="Weekly activity, last 7 days" style={styles.wrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.table}>
          <View style={styles.row}>
            <View style={[styles.statHeader, { borderBottomColor: colors.track }]}>
              <Text style={[styles.headerText, { color: colors.muted }]}>STAT</Text>
            </View>
            {data.map(day => {
              const dateLabel = formatDateKey(day.dateKey);
              return (
                <View
                  key={day.dateKey}
                  accessible
                  accessibilityLabel={`${day.day}, ${dateLabel}`}
                  style={[styles.headerCell, { borderBottomColor: colors.track }]}
                >
                  <Text style={[styles.headerDay, { color: colors.accent }]}>{day.day}</Text>
                  <Text style={[styles.headerDate, { color: colors.muted }]}>{dateLabel.replace(', ', ' ')}</Text>
                </View>
              );
            })}
          </View>
          {STATS.map(stat => (
            <View key={stat} style={styles.row}>
              <View style={[styles.statHeader, { borderBottomColor: colors.track }]}>
                <Text style={[styles.statText, { color: STAT_COLORS[stat] }]}>{stat}</Text>
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
                      {
                        backgroundColor: `${STAT_COLORS[stat]}${Math.max(0x18, Math.min(0xcc, Math.round(0x18 + intensity * 0x88))).toString(16).padStart(2, '0')}`,
                        borderBottomColor: colors.track,
                      },
                    ]}
                  >
                    <Text style={[styles.valueText, { color: colors.text }]}>{value}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  scrollContent: {
    minWidth: '100%',
  },
  table: {
    minWidth: 470,
  },
  row: {
    flexDirection: 'row',
  },
  statHeader: {
    width: 52,
    minHeight: 45,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCell: {
    width: 59,
    minHeight: 45,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  valueCell: {
    width: 59,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  headerDay: {
    fontSize: 10,
    fontWeight: '700',
  },
  headerDate: {
    fontSize: 8,
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
  },
});

