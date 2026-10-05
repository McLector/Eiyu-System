import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

/** Equal-width choices in a row (HERO / STATS / WEEKLY). Pressing the chosen one does nothing. */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  const t = useTokens();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.row}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected, selected }}
            onPress={() => { if (!selected) onChange(option.value); }}
            style={[
              styles.segment,
              selected
                ? { backgroundColor: t['accent-glass'], borderColor: t['accent-border'] }
                : { backgroundColor: 'transparent', borderColor: t['glass-border'] },
            ]}>
            <Text style={[styles.label, { color: selected ? t['accent-text'] : t['dim-flat'], fontFamily: fonts.display }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  label: { fontSize: 13, letterSpacing: 1 },
});
