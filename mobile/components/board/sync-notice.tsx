import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';

import { AlertIcon, CheckIcon, ClockIcon } from '@/components/eiyu/icons';
import { Button } from '@/components/ui/button';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface Props {
  /** Changes that have not reached the server yet. */
  waiting: number;
  /** Changes that could not be saved and are waiting for the user to retry or dismiss them. */
  failed: number;
  offline: boolean;
  onReview: () => void;
  /** A held change that expired after 30 days and was removed from this device. Plain wording with no quest name. */
  expiredNotice?: string | null;
  onDismissExpired?: () => void;
}

const SYNCED_MS = 2000;
const changes = (count: number) => `${count} ${count === 1 ? 'change' : 'changes'}`;

/**
 * One line above the lanes about the offline queue: how many changes are waiting, how many were not saved (with a
 * Review button), and a brief "Synced" once the last waiting one lands. It is quiet when there is nothing to say, and a
 * live region so a screen reader hears the count change.
 */
export function SyncNotice({ waiting, failed, offline, onReview, expiredNotice, onDismissExpired }: Props) {
  const t = useTokens();
  const [synced, setSynced] = useState(false);
  const previousWaiting = useRef(0);

  useEffect(() => {
    const landed = previousWaiting.current > 0 && waiting === 0 && failed === 0;
    previousWaiting.current = waiting;
    if (!landed) return;
    setSynced(true);
    const timer = setTimeout(() => setSynced(false), SYNCED_MS);
    return () => clearTimeout(timer);
  }, [waiting, failed]);

  const showSynced = synced && waiting === 0 && failed === 0;
  const expired = expiredNotice ? expiredNotice : null;
  if (waiting === 0 && failed === 0 && !showSynced && !expired) return null;

  return (
    <View
      testID="sync-notice"
      accessibilityRole={failed > 0 || expired ? 'alert' : undefined}
      accessibilityLiveRegion={failed > 0 || expired ? 'assertive' : 'polite'}
      style={[styles.card, { borderColor: failed > 0 || expired ? t['danger-border'] : t['accent-border'], backgroundColor: t['panel-flat'] }]}>
      {failed > 0 ? (
        <View style={styles.row}>
          <AlertIcon size={16} color={t.danger} />
          <AppText style={[styles.text, { color: t.danger, fontFamily: fonts.bodySemi }]}>{`${changes(failed)} not saved`}</AppText>
          <Button variant="secondary" label="Review" accessibilityLabel="Review changes that were not saved" onPress={onReview} />
        </View>
      ) : null}
      {expired ? (
        <View style={styles.row}>
          <AlertIcon size={16} color={t.danger} />
          <AppText style={[styles.text, { color: t.danger, fontFamily: fonts.bodySemi }]}>{expired}</AppText>
          <Button variant="secondary" label="Dismiss" accessibilityLabel="Dismiss expired change notice" onPress={() => onDismissExpired?.()} />
        </View>
      ) : null}
      {waiting > 0 ? (
        <View>
          <View style={styles.row}>
            <ClockIcon size={16} color={t['muted-flat']} />
            <AppText style={[styles.text, { color: t.text, fontFamily: fonts.bodySemi }]}>{`${changes(waiting)} waiting to sync`}</AppText>
          </View>
          {offline ? (
            <AppText style={[styles.note, { color: t['muted-flat'], fontFamily: fonts.body }]}>{"You're offline. They will send when you reconnect."}</AppText>
          ) : null}
        </View>
      ) : null}
      {showSynced ? (
        <View style={styles.row}>
          <CheckIcon size={16} color={t.success} />
          <AppText style={[styles.text, { color: t.success, fontFamily: fonts.bodySemi }]}>Synced</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  text: { flexShrink: 1, fontSize: 13, lineHeight: 19 },
  note: { fontSize: 12, lineHeight: 18, marginTop: 2 },
});
