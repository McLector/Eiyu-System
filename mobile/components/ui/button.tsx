import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MOTION } from '@eiyu/shared';

import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';
import { useReducedMotion } from './use-reduced-motion';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive';

interface Props {
  variant: ButtonVariant;
  label: string;
  onPress: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  busy?: boolean;
  icon?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

function colours(t: Readonly<Record<string, string>>, variant: ButtonVariant) {
  switch (variant) {
    case 'primary': return { background: t.accent, border: t.accent, text: t['on-accent'] };
    case 'secondary': return { background: 'transparent', border: t['accent-border'], text: t['accent-text'] };
    case 'quiet': return { background: 'transparent', border: 'transparent', text: t['muted-flat'] };
    case 'destructive': return { background: t['danger-glass'], border: t['danger-border'], text: t.danger };
  }
}

/** The HUD button: Rajdhani caps, 4px corners, 48dp tall. A busy button keeps its label and ignores further presses. */
export function Button({ variant, label, onPress, onPressIn, onPressOut, disabled, busy, icon, accessibilityLabel, testID, style }: Props) {
  const t = useTokens();
  const reduced = useReducedMotion();
  const c = colours(t, variant);
  const inactive = !!disabled || !!busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: c.background, borderColor: c.border },
        inactive && styles.inactive,
        pressed && !reduced && { transform: [{ scale: MOTION.pressScale }] },
        style,
      ]}>
      {busy ? <ActivityIndicator size="small" color={c.text} accessibilityElementsHidden /> : icon ? <View>{icon}</View> : null}
      <Text style={[styles.label, { color: c.text, fontFamily: fonts.display }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  inactive: { opacity: 0.5 },
  label: { fontSize: 14, letterSpacing: 1.1, textTransform: 'uppercase', textAlign: 'center', flexShrink: 1 },
});
