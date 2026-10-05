import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { levelProgress, STAT_COLORS, type RewardReceipt } from '@eiyu/shared';

import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';
import { useReducedMotion } from './use-reduced-motion';

type Total = RewardReceipt['totals'][number];

const COUNT_UP_MS = 600;
const VISIBLE_MS = 4600;
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

function StatGain({ total }: { total: Total }) {
  const t = useTokens();
  const reduced = useReducedMotion();
  const [xp, setXp] = useState(reduced ? total.after : total.before);

  useEffect(() => {
    if (reduced) { setXp(total.after); return; }
    setXp(total.before);
    const start = Date.now();
    const id = setInterval(() => {
      const progress = Math.min(1, (Date.now() - start) / COUNT_UP_MS);
      setXp(Math.round(total.before + (total.after - total.before) * (1 - (1 - progress) ** 3)));
      if (progress >= 1) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [total, reduced]);

  const now = levelProgress(xp);
  const leveledUp = levelProgress(total.after).level > levelProgress(total.before).level;
  const color = STAT_COLORS[total.stat];
  return (
    <View style={styles.stat}>
      <Text style={[styles.gain, { color, fontFamily: fonts.display }]}>{`${total.stat} ${signed(total.delta)} XP`}</Text>
      <Text style={[styles.level, { color: t['muted-flat'], fontFamily: fonts.mono }]}>{`Level ${now.level} · ${now.xpIntoLevel} / ${now.xpForNextLevel} XP`}</Text>
      {leveledUp ? <Text style={[styles.levelUp, { color: t['accent-text'], fontFamily: fonts.display }]}>Level up</Text> : null}
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${total.stat} level progress`}
        accessibilityValue={{ min: 0, max: now.xpForNextLevel, now: now.xpIntoLevel }}
        style={[styles.track, { backgroundColor: t['bar-track'] }]}>
        <View style={[styles.fill, { backgroundColor: color, width: `${Math.min(100, (now.xpIntoLevel / now.xpForNextLevel) * 100)}%` }]} />
      </View>
    </View>
  );
}

/** The XP card after a confirmed reward: counts up from where the stat was, flags a level-up, then hides itself. */
export function RewardFeedback({ receipt }: { receipt?: RewardReceipt | null }) {
  const t = useTokens();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [receipt?.id]);

  if (!visible || !receipt || receipt.replayed || !receipt.totals.length) return null;

  const summary = receipt.totals
    .map(total => {
      const after = levelProgress(total.after);
      return `${total.stat} ${total.delta > 0 ? 'plus' : 'minus'} ${Math.abs(total.delta)} XP, level ${after.level}, ${after.xpIntoLevel} of ${after.xpForNextLevel} XP`;
    })
    .join('; ');

  return (
    <View
      testID="reward-feedback"
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Confirmed XP reward: ${summary}`}
      style={[styles.card, { backgroundColor: t['panel-flat'], borderColor: t['success-border'] }]}>
      {receipt.totals.map(total => <StatGain key={`${receipt.id}-${total.stat}`} total={total} />)}
      {receipt.components.filter(c => c.kind === 'bonus').map(c => (
        <Text key={`${receipt.id}-bonus-${c.stat}`} style={[styles.bonus, { color: t['dim-flat'], fontFamily: fonts.body }]}>
          {`Completion bonus: ${c.stat} ${signed(c.delta)} XP`}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 4, padding: 12, gap: 12 },
  stat: { gap: 4 },
  gain: { fontSize: 16, letterSpacing: 0.8 },
  level: { fontSize: 12 },
  levelUp: { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  fill: { height: '100%' },
  bonus: { fontSize: 12 },
});
