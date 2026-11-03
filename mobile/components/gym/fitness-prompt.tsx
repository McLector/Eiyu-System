import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';

import { Button } from '@/components/ui/button';
import { TrackerConsent } from '@/components/status/tracker-consent';
import { fonts } from '@/constants/eiyu-theme';
import { useGym } from '@/contexts/gym-store';
import { useTokens } from '@/contexts/theme-store';

/**
 * The Gym tracking notice, shown only after someone asked for a Gym change without permission. Declining just closes it:
 * the screen stays on the readable history. It never writes on its own.
 */
export function FitnessPrompt() {
  const t = useTokens();
  const gym = useGym();
  if (!gym.fitnessPrompt) return null;

  if (!gym.tracker || !gym.userId) {
    return (
      <View testID="gym-fitness-prompt" style={styles.box}>
        <AppText accessibilityRole="alert" style={{ color: t['muted-flat'], fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }}>
          Tracker access is unavailable. Try again in a moment.
        </AppText>
        <Button variant="quiet" label="Close" onPress={() => gym.setFitnessPrompt(false)} />
      </View>
    );
  }

  return (
    <View testID="gym-fitness-prompt" style={styles.box}>
      <TrackerConsent
        userId={gym.userId}
        access={gym.tracker}
        purpose="fitness-tracking"
        audience={gym.audience}
        mode="prompt"
        declineLabel="Not now"
        onChanged={gym.acceptTracker}
        onStale={() => void gym.refreshTracker()}
        onDecline={() => gym.setFitnessPrompt(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, paddingVertical: 8 },
});
