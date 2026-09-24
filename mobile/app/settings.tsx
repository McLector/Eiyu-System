import { StyleSheet, View } from 'react-native';

import SettingsContent from '@/components/eiyu/settings-content';
import { useEiyu } from '@/contexts/eiyu-store';

export default function LegacySettingsRoute() {
  const { theme } = useEiyu();
  return <View style={[styles.root, { backgroundColor: theme.body }]}><SettingsContent /></View>;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
