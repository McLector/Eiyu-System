import AsyncStorage from '@react-native-async-storage/async-storage';

const SOUND_EFFECTS_ENABLED_KEY = 'eiyu:sound-effects-enabled';

/** Device-local UI feedback preference. Sound remains disabled for existing installs. */
export async function getSoundEffectsEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(SOUND_EFFECTS_ENABLED_KEY)) === 'true';
}

export async function setSoundEffectsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SOUND_EFFECTS_ENABLED_KEY, String(enabled));
}
