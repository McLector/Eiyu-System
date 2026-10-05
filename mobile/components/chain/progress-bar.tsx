import { StyleSheet, View } from 'react-native';

import { useTokens } from '@/contexts/theme-store';

/** Whole-number share of stages done; a chain with no stages reads 0, never NaN. */
export function chainPercent(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

/** The chain's progress bar, announced as a progressbar named for the chain. */
export function ChainProgressBar({ name, percent, color }: { name: string; percent: number; color: string }) {
  const t = useTokens();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${name} progress`}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.track, { backgroundColor: t['bar-track'] }]}>
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%' },
});
