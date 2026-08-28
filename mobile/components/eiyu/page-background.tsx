import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';

import { useEiyu } from '@/contexts/eiyu-store';

export function PageBackground() {
  const { theme } = useEiyu();
  return (
    <LinearGradient
      colors={theme.pageGradient}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}
