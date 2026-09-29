import { router } from 'expo-router';
import { useEffect } from 'react';

export default function LegacySettingsRoute() {
  useEffect(() => {
    router.replace({ pathname: '/(tabs)/board', params: { account: 'settings' } });
  }, []);
  return null;
}
