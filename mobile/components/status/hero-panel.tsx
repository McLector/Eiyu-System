import { StyleSheet, Text, View } from 'react-native';
import { RANK_CONFIG, STATS, type Stat, type UserProfile } from '@eiyu/shared';

import { RadarChart } from '@/components/eiyu/radar-chart';
import { SignaturePanel } from '@/components/ui/signature-panel';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

/** The hero view: the rank panel and the stat radar. */
export function HeroPanel({ user }: { user: Pick<UserProfile, 'name' | 'userClass' | 'rank' | 'stats'> }) {
  const t = useTokens();
  const rank = RANK_CONFIG[user.rank];
  const levels = STATS.reduce((acc, stat) => ({ ...acc, [stat]: user.stats[stat].level }), {} as Record<Stat, number>);
  const summary = `Stat levels: ${STATS.map(stat => `${stat} ${levels[stat]}`).join(', ')}`;

  return (
    <View style={styles.wrap}>
      <SignaturePanel style={styles.panel}>
        <Text style={[styles.eyebrow, { color: t['dim-flat'], fontFamily: fonts.display }]}>HERO RANK</Text>
        <View style={[styles.badge, { backgroundColor: rank.bg, borderColor: rank.color }]}>
          <Text style={[styles.badgeText, { color: rank.color, fontFamily: fonts.display }]}>{user.rank}</Text>
        </View>
        <Text testID="status-hero-name" numberOfLines={2} ellipsizeMode="tail" style={[styles.name, { color: t.text, fontFamily: fonts.display }]}>{user.name}</Text>
        <Text numberOfLines={1} style={[styles.class, { color: t['muted-flat'], fontFamily: fonts.body }]}>{user.userClass}</Text>
      </SignaturePanel>

      <View>
        <Text style={[styles.eyebrow, { color: t['dim-flat'], fontFamily: fonts.display }]}>STAT OVERVIEW</Text>
        <View accessible accessibilityLabel={summary} style={styles.radar}>
          <RadarChart values={levels} maxValue={50} size={240} accent={t.accent} fill={t['accent-glass']} gridStroke={t['divider-flat']} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 20 },
  panel: { padding: 20, alignItems: 'center' },
  eyebrow: { fontSize: 11, letterSpacing: 1.6, marginBottom: 12 },
  badge: { width: 72, height: 72, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  badgeText: { fontSize: 32 },
  name: { fontSize: 16, letterSpacing: 1, textAlign: 'center', alignSelf: 'stretch' },
  class: { fontSize: 12, marginTop: 3 },
  radar: { alignItems: 'center' },
});
