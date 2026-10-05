import { useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface Props {
  visible: boolean;
  /** What would be lost, e.g. "Your unsaved profile changes will be lost." */
  message: string;
  onKeep: () => void;
  onDiscard: () => void;
  testID?: string;
}

/** The themed "Discard changes?" confirmation shared by every editor that can be closed with unsaved edits. */
export function DiscardChangesModal({ visible, message, onKeep, onDiscard, testID }: Props) {
  const t = useTokens();
  const keepRef = useRef<View>(null);

  const focusKeep = () => {
    const target = keepRef.current && findNodeHandle(keepRef.current);
    if (target != null) AccessibilityInfo.setAccessibilityFocus(target);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" testID={testID} onShow={focusKeep} onRequestClose={onKeep}>
      <View style={[styles.overlay, { backgroundColor: t.overlay }]}>
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: t.modal, borderColor: t['accent-border'] }]}>
          <Text accessibilityRole="alert" accessibilityLabel="Discard changes?" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>Discard changes?</Text>
          <Text style={[styles.text, { color: t['muted-flat'], fontFamily: fonts.body }]}>{message}</Text>
          <View style={styles.actions}>
            <View ref={keepRef}>
              <Button variant="secondary" label="Keep Editing" onPress={onKeep} />
            </View>
            <Button variant="destructive" label="Discard Changes" onPress={onDiscard} />
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
