import { StyleSheet, Text, View } from 'react-native';
import { STAT_COLORS, STATS, type Stat, type UserProfile } from '@eiyu/shared';

import { StatIcon } from '@/components/eiyu/icons';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

/** Whole-number XP progress, held between 0 and 100 whatever the numbers say (a zero or missing XP cap reads as 0). */
export function xpPercent(xp: number, xpMax: number): number {
  if (!(xpMax > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((xp / xpMax) * 100)));
}

/** One row per stat: icon, code, level, XP and a bar. */
export function StatBars({ stats }: { stats: UserProfile['stats'] }) {
  const t = useTokens();
  return (
    <View>
      {STATS.map((stat: Stat, i) => {
        const { level, xp, xpMax } = stats[stat];
        const pct = xpPercent(xp, xpMax);
        return (
          <View key={stat} style={[styles.row, i > 0 && { borderTopColor: t['divider-flat'], borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.head}>
              <StatIcon stat={stat} size={14} />
              <Text style={[styles.code, { color: STAT_COLORS[stat], fontFamily: fonts.display }]}>{stat}</Text>
              <Text style={[styles.level, { color: t.text }]}>{`Lv.${level}`}</Text>
              <Text style={[styles.xp, { color: t['muted-flat'], fontFamily: fonts.body }]}>{`${xp}/${xpMax} XP`}</Text>
            </View>
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${stat} XP progress: ${pct}%`}
              accessibilityValue={{ min: 0, max: 100, now: pct }}
              style={[styles.track, { backgroundColor: t.track }]}>
              <View style={[styles.fill, { width: `${pct}%`, backgroundColor: STAT_COLORS[stat] }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 10, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: { flex: 1, fontSize: 13, letterSpacing: 1 },
  level: { fontFamily: 'JetBrainsMono_600SemiBold', fontSize: 13 },
  xp: { fontSize: 11 },
  track: { height: 6, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
