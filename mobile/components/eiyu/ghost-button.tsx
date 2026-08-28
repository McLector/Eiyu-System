import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useEiyu } from '@/contexts/eiyu-store';
import { fonts } from '@/constants/eiyu-theme';
import { hapticLight } from '@/lib/haptics';

export function GhostButton({
  label,
  onPress,
  style,
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  const { theme } = useEiyu();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={hapticLight}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.accentGlass,
          borderColor: theme.accentBorder,
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        },
        style,
      ]}>
      {icon}
      <Text style={[styles.label, { color: theme.accent, fontFamily: fonts.displaySemi }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 50,
    paddingVertical: 14,
  },
  label: {
    fontSize: 16,
    letterSpacing: 1,
  },
});
