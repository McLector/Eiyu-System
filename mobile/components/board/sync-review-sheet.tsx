import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';

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
  /** Resolves true when the write was put back in line; false when it was refused (day passed, permission or record changed). */
  onRetry: (id: string) => Promise<boolean>;
  onDismiss: (id: string) => void;
  onClose: () => void;
}

/**
 * Changes that did not reach the server: which quest, what the change was and why it failed. Retry sends it again
 * (not offered once its day has passed); Dismiss drops it and the Board returns to what the server holds.
 */
export function SyncReviewSheet({ visible, entries, onRetry, onDismiss, onClose }: Props) {
  const t = useTokens();
  const [retrying, setRetrying] = useState<ReadonlySet<string>>(new Set());
  const [notices, setNotices] = useState<Readonly<Record<string, string>>>({});
  const alive = useRef(true);
  const inFlight = useRef(new Set<string>());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const retry = async (id: string) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setRetrying(prev => new Set(prev).add(id));
    setNotices(prev => { const { [id]: _gone, ...rest } = prev; return rest; });
    let notice: string | null = null;
    try {
      if (!(await onRetry(id))) notice = 'This change was not retried. Its day may have passed, or the quest or its permission changed. Dismiss it, or review the quest first.';
    } catch {
      notice = 'This change could not be retried. Try again, or dismiss it.';
    } finally {
      inFlight.current.delete(id);
      if (alive.current) setRetrying(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
    if (notice && alive.current) setNotices(prev => ({ ...prev, [id]: notice! }));
  };

  return (
    <Sheet visible={visible} title="NOT SAVED" onClose={onClose} testID="sync-review-sheet">
      {entries.map(entry => {
        const name = entry.label ?? 'A quest';
        return (
          <View key={entry.id} style={[styles.card, { borderColor: t['danger-border'], backgroundColor: t['panel-flat'] }]}>
            <View style={styles.header}>
              <AlertIcon size={15} color={t.danger} />
              <AppText style={[styles.what, { color: t.danger, fontFamily: fonts.display }]}>{describeEntry(entry)}</AppText>
            </View>
            <AppText style={[styles.name, { color: t.text, fontFamily: fonts.bodySemi }]}>{name}</AppText>
            <AppText style={[styles.reason, { color: t['muted-flat'], fontFamily: fonts.body }]}>{entry.failure?.message ?? 'Not saved.'}</AppText>
            {notices[entry.id] ? <AppText accessibilityRole="alert" style={[styles.reason, { color: t.danger, fontFamily: fonts.body }]}>{notices[entry.id]}</AppText> : null}
            <View style={styles.actions}>
              {entry.failure?.reason === 'day-passed' ? null : (
                <Button variant="secondary" label="Retry" accessibilityLabel={`Retry ${name}`} disabled={retrying.has(entry.id)} onPress={() => void retry(entry.id)} />
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
