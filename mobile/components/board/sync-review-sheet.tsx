import { StyleSheet, Text, View } from 'react-native';

import { AlertIcon } from '@/components/eiyu/icons';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';
import { describeEntry, type QueueEntry } from '@/lib/write-queue';

interface Props {
  visible: boolean;
  /** The writes that could not be saved. */
  entries: QueueEntry[];
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
}

/**
 * Changes that did not reach the server: which quest, what the change was and why it failed. Retry sends it again
 * (not offered once its day has passed); Dismiss drops it and the Board returns to what the server holds.
 */
export function SyncReviewSheet({ visible, entries, onRetry, onDismiss, onClose }: Props) {
  const t = useTokens();
  return (
    <Sheet visible={visible} title="NOT SAVED" onClose={onClose} testID="sync-review-sheet">
      {entries.map(entry => {
        const name = entry.label ?? 'A quest';
        return (
          <View key={entry.id} style={[styles.card, { borderColor: t['danger-border'], backgroundColor: t['panel-flat'] }]}>
            <View style={styles.header}>
              <AlertIcon size={15} color={t.danger} />
              <Text style={[styles.what, { color: t.danger, fontFamily: fonts.display }]}>{describeEntry(entry)}</Text>
            </View>
            <Text style={[styles.name, { color: t.text, fontFamily: fonts.bodySemi }]}>{name}</Text>
            <Text style={[styles.reason, { color: t['muted-flat'], fontFamily: fonts.body }]}>{entry.failure?.message ?? 'Not saved.'}</Text>
            <View style={styles.actions}>
              {entry.failure?.reason === 'day-passed' ? null : (
                <Button variant="secondary" label="Retry" accessibilityLabel={`Retry ${name}`} onPress={() => onRetry(entry.id)} />
              )}
              <Button variant="secondary" label="Dismiss" accessibilityLabel={`Dismiss ${name}`} onPress={() => onDismiss(entry.id)} />
            </View>
          </View>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 4, padding: 12, gap: 6, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  what: { fontSize: 13, letterSpacing: 1 },
  name: { fontSize: 16 },
  reason: { fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
