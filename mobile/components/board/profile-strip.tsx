import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { profileInitials, RANK_CONFIG, STATS, STAT_COLORS, type Rank, type UserProfile } from '@eiyu/shared';

import { StatIcon } from '@/components/eiyu/icons';
import { SignaturePanel } from '@/components/ui/signature-panel';
import { useReducedMotion } from '@/components/ui/use-reduced-motion';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface Props {
  name: string;
  userClass: string;
  rank: Rank;
  stats: UserProfile['stats'];
  /** Quests answered today and how many are due (the Board's Today count). */
  completed: number;
  total: number;
}

/**
 * The per-stat XP bar. It animates scaleX rather than width so the fill glides on the UI thread while JS is busy
 * committing the completion that earned the XP; with "remove animations" on it jumps.
 */
function StatXpBar({ pct, color, track, stat, level }: { pct: number; color: string; track: string; stat: string; level: number }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(pct / 100);

  useEffect(() => {
    progress.value = reduced ? pct / 100 : withTiming(pct / 100, { duration: 550, easing: Easing.out(Easing.cubic) });
  }, [pct, progress, reduced]);

  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ now: pct, min: 0, max: 100 }}
      accessibilityLabel={`${stat} XP progress: ${pct}% to level ${level + 1}`}
      style={[styles.xpTrack, { backgroundColor: track }]}>
      <Animated.View style={[styles.xpFill, { backgroundColor: color }, fillStyle]} />
    </View>
  );
}

/** A compact profile for the top of the Board: who you are, your rank and today's progress; tap for the five stats. */
export function ProfileStrip({ name, userClass, rank, stats, completed, total }: Props) {
  const t = useTokens();
  const [open, setOpen] = useState(false);
  const rankConfig = RANK_CONFIG[rank];
  const fraction = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;

  return (
    <SignaturePanel style={styles.panel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, rank ${rank}, ${completed} of ${total} due today`}
        accessibilityHint={open ? 'Hide stats' : 'Show stats'}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(previous => !previous)}
        style={styles.trigger}>
        <View style={styles.top}>
          <View style={[styles.avatar, { backgroundColor: t['accent-glass'], borderColor: t['accent-border'] }]}>
            <Text style={[styles.avatarText, { color: t['accent-text'], fontFamily: fonts.display }]}>{profileInitials(name)}</Text>
          </View>
          <View style={styles.copy}>
            <Text testID="board-profile-name" numberOfLines={2} ellipsizeMode="tail" style={[styles.name, { color: t.text, fontFamily: fonts.display }]}>{name}</Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.userClass, { color: t['muted-flat'], fontFamily: fonts.body }]}>{userClass}</Text>
          </View>
          <Text style={[styles.rank, { color: rankConfig.color, borderColor: rankConfig.color, fontFamily: fonts.display }]}>{rank}</Text>
        </View>
        <View style={styles.today}>
          <Text style={[styles.todayText, { color: t['accent-text'], fontFamily: fonts.mono }]}>{`TODAY ${completed}/${total}`}</Text>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Quests completed today"
            accessibilityValue={{ min: 0, max: total, now: completed }}
            style={[styles.todayTrack, { backgroundColor: t['bar-track'] }]}>
            <View style={[styles.todayFill, { backgroundColor: t.accent, width: `${fraction * 100}%` }]} />
          </View>
        </View>
      </Pressable>

      {open ? (
        <View style={[styles.stats, { borderTopColor: t['divider-flat'] }]}>
          {STATS.map(stat => {
            const data = stats[stat];
            const pct = data.xpMax > 0 ? Math.min(100, Math.max(0, Math.round((data.xp / data.xpMax) * 100))) : 0;
            return (
              <View key={stat} style={styles.statRow}>
                <StatIcon stat={stat} size={15} />
                <Text style={[styles.statCode, { color: t['muted-flat'], fontFamily: fonts.display }]}>{stat}</Text>
                <Text style={[styles.statLevel, { color: STAT_COLORS[stat], fontFamily: fonts.mono }]}>{String(data.level)}</Text>
                <StatXpBar pct={pct} color={STAT_COLORS[stat]} track={t['bar-track']} stat={stat} level={data.level} />
              </View>
            );
          })}
        </View>
      ) : null}
    </SignaturePanel>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 12 },
  trigger: { gap: 10, minHeight: 48 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700' },
  copy: { flex: 1, minWidth: 0 },
  name: { fontSize: 17, letterSpacing: 0.5 },
  userClass: { fontSize: 12, marginTop: 1 },
  rank: { minWidth: 32, minHeight: 32, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1.5, borderRadius: 4, textAlign: 'center', textAlignVertical: 'center', fontSize: 16 },
  today: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  todayText: { fontSize: 12 },
  todayTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  todayFill: { height: '100%' },
  stats: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statCode: { width: 34, fontSize: 12, letterSpacing: 1 },
  statLevel: { width: 24, fontSize: 13, textAlign: 'right' },
  xpTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  xpFill: { height: '100%', width: '100%', transformOrigin: 'left center' },
});
