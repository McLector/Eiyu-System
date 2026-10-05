import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAVIGATION_GUARD_COPY } from '@eiyu/shared';

import { PlusIcon } from '@/components/eiyu/icons';
import { Button } from '@/components/ui/button';
import { DiscardChangesModal } from '@/components/ui/discard-changes-modal';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface Props {
  title: string;
  closeLabel: string;
  /** Unsaved edits: leaving asks first. */
  dirty: boolean;
  /** A save is running or its answer is unknown: leaving is blocked. */
  busy: boolean;
  /** The save's answer is unknown, so leaving anyway is offered. */
  uncertain: boolean;
  /** Set to true just before closing after a successful save, so the guard stays out of the way. */
  committed: MutableRefObject<boolean>;
  discardMessage: string;
  /** Runs when the user leaves with an unconfirmed save (refresh the list so the answer shows up there). */
  onLeaveUnconfirmed: () => void;
  onClose: () => void;
  error?: string | null;
  /** The pinned Save button. */
  footer: ReactNode;
  testID: string;
  children: ReactNode;
}

/** The full-screen editor chrome the Gym editors share: title and close, a keyboard-aware form, a pinned footer, and the leave guard. */
export function EditorFrame({ title, closeLabel, dirty, busy, uncertain, committed, discardMessage, onLeaveUnconfirmed, onClose, error, footer, testID, children }: Props) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [prompt, setPrompt] = useState<'discard' | 'busy' | null>(null);
  const held = useRef<unknown>(null);

  useEffect(() => navigation.addListener('beforeRemove', event => {
    if (committed.current || (!dirty && !busy)) return;
    event.preventDefault();
    held.current = event.data.action;
    setPrompt(busy ? 'busy' : 'discard');
  }), [navigation, dirty, busy, committed]);

  const release = () => {
    committed.current = true;
    setPrompt(null);
    navigation.dispatch(held.current as Parameters<typeof navigation.dispatch>[0]);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.root, { backgroundColor: t['page-flat'] }]}>
      <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: t['divider-flat'] }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>{title}</Text>
        <Pressable testID={`${testID}-close`} accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={styles.close}>
          <View style={styles.closeGlyph}><PlusIcon size={22} color={t['muted-flat']} /></View>
        </Pressable>
      </View>

      <View testID={`${testID}-form`} style={styles.form}>
        <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}>{children}</KeyboardAwareScrollView>
      </View>

      <View testID={`${testID}-footer`} style={[styles.footer, { borderTopColor: t['divider-flat'], paddingBottom: Math.max(12, insets.bottom) }]}>
        {error ? <Text accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>{error}</Text> : null}
        {footer}
      </View>

      <DiscardChangesModal visible={prompt === 'discard'} testID={`${testID}-discard-modal`} message={discardMessage} onKeep={() => setPrompt(null)} onDiscard={release} />
      <Modal testID={`${testID}-busy-modal`} visible={prompt === 'busy'} transparent animationType="fade" onRequestClose={() => setPrompt(null)}>
        <View style={[styles.overlay, { backgroundColor: t.overlay }]} accessibilityViewIsModal>
          <View style={[styles.dialog, { backgroundColor: t.modal, borderColor: t['accent-border'] }]}>
            <Text accessibilityRole="header" style={[styles.dialogTitle, { color: t.text, fontFamily: fonts.display }]}>{NAVIGATION_GUARD_COPY.busyTitle}</Text>
            <Text style={[styles.dialogText, { color: t['muted-flat'], fontFamily: fonts.body }]}>{NAVIGATION_GUARD_COPY.busyBody}</Text>
            <View style={styles.dialogActions}>
              {uncertain ? <Button variant="quiet" label="Leave without confirming" onPress={() => { onLeaveUnconfirmed(); release(); }} /> : null}
              <Button variant="secondary" label="Stay" onPress={() => setPrompt(null)} />
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 4, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontSize: 20, letterSpacing: 1 },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { transform: [{ rotate: '45deg' }] },
  form: { flex: 1 },
  formContent: { padding: 20, gap: 18 },
  note: { fontSize: 12, lineHeight: 17 },
  footer: { flexShrink: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  overlay: { flex: 1, justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: 1, borderRadius: 4, padding: 20, gap: 10 },
  dialogTitle: { fontSize: 18, letterSpacing: 0.8 },
  dialogText: { fontSize: 14, lineHeight: 21 },
  dialogActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
});
