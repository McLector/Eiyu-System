import AsyncStorage from '@react-native-async-storage/async-storage';

const ENABLED_KEY = 'eiyu:notifications-enabled';

/** R-42: global reminder toggle, device-local (not synced — it's a device preference, not account data). */
export async function getNotificationsEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(ENABLED_KEY);
  return raw === null ? true : raw === 'true';
}

export async function setNotificationsEnabled(enabled: boolean) {
  await AsyncStorage.setItem(ENABLED_KEY, String(enabled));
}
