import { Modal, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';

import { Button } from '@/components/ui/button';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
  testID?: string;
}

/** A small centred "are you sure" for destructive actions; the back button cancels it unless the action is running. */
export function ConfirmModal({ visible, title, message, confirmLabel, onCancel, onConfirm, busy, testID }: Props) {
  const t = useTokens();
  return (
    <Modal testID={testID} visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onCancel(); }}>
      <View style={[styles.overlay, { backgroundColor: t.overlay }]}>
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: t.modal, borderColor: t['danger-border'] }]}>
          <AppText accessibilityRole="header" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>{title}</AppText>
          <AppText style={[styles.text, { color: t['muted-flat'], fontFamily: fonts.body }]}>{message}</AppText>
          <View style={styles.actions}>
            <Button variant="secondary" label="Cancel" disabled={busy} onPress={onCancel} />
            <Button variant="destructive" label={confirmLabel} busy={busy} onPress={onConfirm} />
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
