import { BlurView } from 'expo-blur';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useEiyu } from '@/contexts/eiyu-store';

export function GlassView({
  style,
  small,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  children?: React.ReactNode;
}) {
  const { theme, darkMode } = useEiyu();
  return (
    <View
      style={[
        {
          borderRadius: small ? 14 : 20,
          borderWidth: 1,
          borderColor: theme.glassBorder,
          overflow: 'hidden',
          backgroundColor: small ? theme.glassSm : theme.glass,
        },
        style,
      ]}>
      <BlurView
        intensity={small ? 30 : 40}
        tint={darkMode ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View>{children}</View>
    </View>
  );
}
