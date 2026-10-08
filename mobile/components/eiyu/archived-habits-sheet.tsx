import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { formatError, partitionBoardQuests, type Quest } from '@eiyu/shared';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { StateBlock } from '@/components/ui/state-block';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { useTokens } from '@/contexts/theme-store';

const kindLabel = (quest: Quest) =>
  quest.questType === 'one_time' ? '1-Time quest' : quest.questType === 'backlog' ? 'Backlog quest' : 'Recurring habit';

/** Archived quests, reached from the account menu. Restore brings one back; Delete removes it and its history for good. */
export default function ArchivedHabitsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTokens();
  const { user, restoreQuest, deleteQuest } = useEiyu();
  const archived = partitionBoardQuests(user.quests).archivedQuests;
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Quest | null>(null);
  const [deleting, setDeleting] = useState(false);

  const mark = (id: string) => setPending(previous => new Set(previous).add(id));
  const unmark = (id: string) => setPending(previous => { const next = new Set(previous); next.delete(id); return next; });

  const restore = async (quest: Quest) => {
    setError(null);
    mark(quest.id);
    try { await restoreQuest(quest.id); }
    catch (err) { setError(formatError(err)); }
    finally { unmark(quest.id); }
  };

  const confirmDelete = async () => {
    if (!confirm || deleting) return;
    const target = confirm;
    setError(null);
    setDeleting(true);
    mark(target.id);
    try { await deleteQuest(target.id); }
    catch (err) { setError(formatError(err)); }
    finally {
      unmark(target.id);
      setDeleting(false);
      setConfirm(null);
    }
  };

  return (
    <>
      <Sheet visible={visible} title="ARCHIVED HABITS" closeLabel="Close Archived habits" onClose={onClose} testID="archived-sheet">
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: t.danger, fontFamily: fonts.body }]}>{error}</Text> : null}
        {archived.length === 0 ? (
          <View testID="archived-empty">
            <StateBlock kind="empty">No archived quests. Archived definitions will stay here with their history.</StateBlock>
          </View>
        ) : archived.map(quest => {
          const busy = pending.has(quest.id);
          return (
            <View key={quest.id} style={[styles.row, { borderBottomColor: t['divider-flat'] }]}>
              <View style={styles.copy}>
                <Text style={[styles.name, { color: t.text, fontFamily: fonts.display }]}>{quest.name}</Text>
                <Text style={[styles.kind, { color: t['muted-flat'], fontFamily: fonts.body }]}>{kindLabel(quest)}</Text>
              </View>
              <View style={styles.actions}>
                <Button variant="secondary" label="Restore" accessibilityLabel={`Restore ${quest.name}`} busy={busy && !deleting} disabled={busy && deleting} onPress={() => void restore(quest)} />
                <Button variant="destructive" label="Delete" accessibilityLabel={`Delete ${quest.name}`} disabled={busy} onPress={() => setConfirm(quest)} />
              </View>
            </View>
          );
        })}
      </Sheet>

      <Modal
        visible={confirm !== null}
        transparent
        animationType="fade"
        testID="archived-delete-modal"
        onRequestClose={() => { if (!deleting) setConfirm(null); }}>
        <View style={[styles.overlay, { backgroundColor: t.overlay }]}>
          <View accessibilityViewIsModal style={[styles.card, { backgroundColor: t.modal, borderColor: t['danger-border'] }]}>
            <Text accessibilityRole="header" style={[styles.cardTitle, { color: t.text, fontFamily: fonts.display }]}>Delete permanently?</Text>
            <Text style={[styles.cardText, { color: t['muted-flat'], fontFamily: fonts.body }]}>
              {`"${confirm?.name ?? ''}" and its history will be deleted. This cannot be undone.`}
            </Text>
            <View style={styles.cardActions}>
              <Button variant="quiet" label="Cancel" disabled={deleting} onPress={() => setConfirm(null)} />
              <Button variant="destructive" label="Confirm permanent delete" busy={deleting} onPress={() => void confirmDelete()} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  error: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  row: { paddingVertical: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  copy: { gap: 2 },
  name: { fontSize: 16, letterSpacing: 0.4 },
  kind: { fontSize: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  overlay: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: 1, borderRadius: 4, padding: 20, gap: 10 },
  cardTitle: { fontSize: 20, letterSpacing: 1, textTransform: 'uppercase' },
  cardText: { fontSize: 14, lineHeight: 21 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
});
