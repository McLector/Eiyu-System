import { Pressable, StyleSheet, Text } from 'react-native';
import { STAT_COLORS, type Stat } from '@eiyu/shared';

import { StatIcon } from '@/components/eiyu/icons';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

/** One selectable stat in an editor: its icon over its code, tinted with the stat's own colour when chosen. */
export function StatChip({ stat, selected, onPress, disabled }: { stat: Stat; selected: boolean; onPress: () => void; disabled?: boolean }) {
  const t = useTokens();
  const color = STAT_COLORS[stat];
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={stat}
      accessibilityState={{ checked: selected, selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.base,
        selected ? { backgroundColor: `${color}18`, borderColor: `${color}55` } : { backgroundColor: 'transparent', borderColor: t['glass-border'] },
        disabled && styles.disabled,
      ]}>
      <StatIcon stat={stat} size={13} />
      <Text style={[styles.code, { color: selected ? color : t['dim-flat'], fontFamily: fonts.display }]}>{stat}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 8, paddingHorizontal: 4, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center', gap: 4 },
  disabled: { opacity: 0.5 },
  code: { fontSize: 11, letterSpacing: 0.9 },
});
