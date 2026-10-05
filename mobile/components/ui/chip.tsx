import { Pressable, StyleSheet, Text } from 'react-native';

import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** `radio` for one choice among several, `checkbox` for any number. */
  kind?: 'radio' | 'checkbox';
  disabled?: boolean;
  /** A narrower chip for rows of seven (days); it keeps the 48dp height. */
  compact?: boolean;
  /** What a screen reader says when it should be longer than what is shown ("Monday" for "M"). */
  accessibilityLabel?: string;
  testID?: string;
}

export function Chip({ label, selected, onPress, kind = 'radio', disabled, compact, accessibilityLabel, testID }: Props) {
  const t = useTokens();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={kind}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: selected, selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.base,
        compact ? styles.compact : styles.regular,
        selected
          ? { backgroundColor: t['accent-glass'], borderColor: t['accent-border'] }
          : { backgroundColor: 'transparent', borderColor: t['glass-border'] },
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.label, { color: selected ? t['accent-text'] : t['dim-flat'], fontFamily: fonts.display }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  regular: { minWidth: 44, paddingHorizontal: 12 },
  compact: { minWidth: 40, paddingHorizontal: 4 },
  disabled: { opacity: 0.5 },
  label: { fontSize: 12, letterSpacing: 0.9 },
});
