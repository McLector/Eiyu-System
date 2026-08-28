/**
 * Improvement-pass #5/#15: consistent haptic feedback on key interactions.
 * All calls are fire-and-forget with swallowed errors - haptics must never
 * break the action they accompany. No-op on web.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const SUPPORTED = Platform.OS !== 'web';

/** Subtle tick for taps that register but aren't milestones (buttons, toggles). */
export function hapticLight() {
  if (!SUPPORTED) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Success cue for milestone moments: completing a quest, saving changes. */
export function hapticSuccess() {
  if (!SUPPORTED) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}