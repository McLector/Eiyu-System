import { useRef } from 'react';
import { AccessibilityInfo, Modal, StyleSheet, Text, View } from 'react-native';
import type { Quest } from '@eiyu/shared';

import { Button } from '@/components/ui/button';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface Props {
  quest: Quest | null;
  /** The delete is running: Back and both buttons are held until it finishes. */
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** The permanent-delete question: a small centred confirmation, because it is destructive and cannot be undone. */
export function DeleteQuestModal({ quest, pending, error, onCancel, onConfirm }: Props) {
  const t = useTokens();
  const cancelRef = useRef<View>(null);

  return (
    <Modal
      testID="board-delete-modal"
      visible={quest !== null}
      transparent
      animationType="fade"
      onShow={() => {
        if (cancelRef.current) AccessibilityInfo.sendAccessibilityEvent(cancelRef.current, 'focus');
      }}
      onRequestClose={() => { if (!pending) onCancel(); }}>
      <View style={[styles.overlay, { backgroundColor: t.overlay }]} accessibilityViewIsModal>
        <View style={[styles.card, { backgroundColor: t.modal, borderColor: t['danger-border'] }]}>
          <Text style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>{`DELETE ${quest?.name ?? ''} PERMANENTLY?`}</Text>
          <Text style={[styles.text, { color: t['muted-flat'], fontFamily: fonts.body }]}>
            This permanently removes the saved quest. Its History, Weekly Review, and earned XP remain. This cannot be undone.
          </Text>
          {error ? <Text accessibilityRole="alert" style={[styles.text, { color: t.danger, fontFamily: fonts.body }]}>{error}</Text> : null}
          <View style={styles.actions}>
            <View ref={cancelRef}>
              <Button testID="board-delete-cancel" variant="quiet" label="Cancel" disabled={pending} onPress={onCancel} />
            </View>
            <Button testID="board-delete-confirm" variant="destructive" label="Confirm permanent delete" busy={pending} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: 1, borderRadius: 4, padding: 20, gap: 10 },
  title: { fontSize: 18, letterSpacing: 0.8 },
  text: { fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
});
