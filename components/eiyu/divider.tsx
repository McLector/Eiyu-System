import { View } from 'react-native';

import { useEiyu } from '@/contexts/eiyu-store';

export function Divider({ style }: { style?: object }) {
  const { theme } = useEiyu();
  return <View style={[{ height: 1, backgroundColor: theme.glassBorder }, style]} />;
}
