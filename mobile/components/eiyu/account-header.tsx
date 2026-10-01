import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import { formatError, normalizeProfileEdit, profileInitials, RANK_CONFIG } from '@eiyu/shared';

import SettingsContent from '@/components/eiyu/settings-content';
import { fonts } from '@/constants/eiyu-theme';
import { useAuth } from '@/contexts/auth-store';
import { useEiyu } from '@/contexts/eiyu-store';

type Sheet = 'menu' | 'profile' | 'settings' | null;

function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { user, theme, saveProfile } = useEiyu();
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState(user.name);
  const [userClass, setUserClass] = useState(user.userClass);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const keepEditingRef = useRef<View>(null);
  const saving = useRef(false);
  const dirty = displayName !== user.name || userClass !== user.userClass;

  useEffect(() => {
    setDisplayName(user.name);
    setUserClass(user.userClass);
    setError(null);
  }, [user.name, user.userClass]);

  const requestClose = () => {
    if (pending) return;
    if (!dirty) {
      onClose();
      return;
    }
    setDiscardPrompt(true);
  };

  const focusKeepEditing = () => {
    const target = keepEditingRef.current && findNodeHandle(keepEditingRef.current);
    if (target != null) AccessibilityInfo.setAccessibilityFocus(target);
  };

  const save = async () => {
    if (saving.current) return;
    try {
      setError(null);
      const normalized = normalizeProfileEdit({ displayName, userClass }, {
        displayName: user.name, userClass: user.userClass,
      });
      saving.current = true;
      setPending(true);
      await saveProfile(normalized);
      onClose();
    } catch (err) {
      setError(formatError(err));
    } finally {
      saving.current = false;
      setPending(false);
    }
  };

  return (
    <>
    <Modal visible transparent animationType="slide" onRequestClose={requestClose}>
      <View style={[styles.modalRoot, { backgroundColor: theme.overlay }]}>
        <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" style={[styles.sheet, { backgroundColor: theme.modal, borderColor: theme.glassBorder, paddingBottom: 30 + insets.bottom }]}>
          <View style={styles.sheetHeading}>
            <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: fonts.display }]}>EDIT DETAILS</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close Edit details" onPress={requestClose} disabled={pending}><Text style={[styles.close, { color: theme.muted }]}>×</Text></Pressable>
          </View>
          <Text style={[styles.fieldLabel, { color: theme.muted, fontFamily: fonts.display }]}>DISPLAY NAME</Text>
          <TextInput accessibilityLabel="Display name" value={displayName} editable={!pending} onChangeText={value => setDisplayName(value)} autoFocus style={[styles.input, { color: theme.text, borderColor: theme.glassBorder, backgroundColor: theme.track }]} />
          <Text style={[styles.fieldLabel, { color: theme.muted, fontFamily: fonts.display }]}>CLASS</Text>
          <TextInput accessibilityLabel="Class" value={userClass} editable={!pending} onChangeText={value => setUserClass(value)} style={[styles.input, { color: theme.text, borderColor: theme.glassBorder, backgroundColor: theme.track }]} />
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={requestClose} disabled={pending}><Text style={[styles.actionText, { color: theme.muted, fontFamily: fonts.display }]}>CANCEL</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={pending ? 'Saving' : 'Save'} onPress={() => void save()} disabled={pending} style={[styles.saveButton, { borderColor: theme.accentBorder, backgroundColor: theme.accentGlass }]}><Text style={[styles.actionText, { color: theme.accent, fontFamily: fonts.display }]}>{pending ? 'SAVING…' : 'SAVE'}</Text></Pressable>
          </View>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
    <Modal
      visible={discardPrompt}
      transparent
      animationType="fade"
      testID="profile-discard-modal"
      onShow={focusKeepEditing}
      onRequestClose={() => setDiscardPrompt(false)}>
        <View style={[styles.promptOverlay, { backgroundColor: theme.overlay }]}>
        <View
          accessibilityViewIsModal
          style={[styles.promptCard, { backgroundColor: theme.modal, borderColor: theme.glassBorder }]}>
          <Text accessibilityRole="alert" accessibilityLabel="Discard changes?" style={[styles.sheetTitle, { color: theme.text, fontFamily: fonts.display }]}>Discard changes?</Text>
          <Text style={[styles.promptText, { color: theme.muted, fontFamily: fonts.body }]}>Your unsaved profile changes will be lost.</Text>
          <View style={styles.actions}>
            <Pressable
              ref={keepEditingRef}
              accessibilityRole="button"
              accessibilityLabel="Keep Editing"
              onPress={() => setDiscardPrompt(false)}
              style={styles.promptButton}>
              <Text style={[styles.actionText, { color: theme.accent, fontFamily: fonts.display }]}>KEEP EDITING</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Discard Changes"
              onPress={() => { setDiscardPrompt(false); onClose(); }}
              style={[styles.promptButton, { borderColor: '#f87171' }]}>
              <Text style={[styles.actionText, { color: '#f87171', fontFamily: fonts.display }]}>DISCARD</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

export default function AccountHeader() {
  const { account } = useLocalSearchParams<{ account?: string }>();
  const { user, theme } = useEiyu();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (account !== 'settings') return;
    setSheet('settings');
    router.setParams({ account: undefined });
  }, [account]);
  const rankCfg = RANK_CONFIG[user.rank];
  const accountLabel = `${user.name}, ${user.userClass}, rank ${user.rank}`;

  const logout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError(null);
    const { error } = await signOut();
    if (error) setLogoutError(formatError(error));
    else setSheet(null);
    setLogoutPending(false);
  };

  return (
    <>
      <View style={[styles.header, { backgroundColor: theme.nav, borderBottomColor: theme.navBorder, paddingTop: insets.top }]}>
        <View style={styles.brand}><Text testID="account-brand-mark" style={[styles.brandMark, { color: theme.accent, borderColor: theme.accentBorder, backgroundColor: theme.accentGlass }]}>英</Text><Text style={[styles.brandText, { color: theme.text, fontFamily: fonts.display }]}>EIYU</Text></View>
        <Pressable testID="account-trigger" accessibilityRole="button" accessibilityLabel={accountLabel} accessibilityHint="Open account menu" onPress={() => { setLogoutError(null); setSheet('menu'); }} style={styles.accountTrigger}>
          <View style={[styles.avatar, { backgroundColor: theme.accentGlass, borderColor: theme.accentBorder }]}><Text style={[styles.avatarText, { color: theme.accent, fontFamily: fonts.display }]}>{profileInitials(user.name)}</Text></View>
          <View style={styles.accountCopy}><Text numberOfLines={1} style={[styles.accountName, { color: theme.text, fontFamily: fonts.display }]}>{user.name}</Text><Text numberOfLines={1} style={[styles.accountClass, { color: theme.muted, fontFamily: fonts.body }]}>{user.userClass}</Text></View>
          <Text style={[styles.rank, { color: rankCfg.color, borderColor: rankCfg.color }]}>{user.rank}</Text>
        </Pressable>
      </View>

      <Modal visible={sheet === 'menu'} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable style={[styles.menuOverlay, { backgroundColor: theme.overlay }]} onPress={() => setSheet(null)}>
          <Pressable style={[styles.menu, { backgroundColor: theme.modal, borderColor: theme.glassBorder }]} onPress={event => event.stopPropagation()} accessibilityViewIsModal>
            <Text style={[styles.menuHeading, { color: theme.muted, fontFamily: fonts.display }]}>ACCOUNT</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit details" style={styles.menuAction} onPress={() => setSheet('profile')}><Text style={[styles.menuText, { color: theme.text, fontFamily: fonts.display }]}>Edit details</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Settings" style={styles.menuAction} onPress={() => setSheet('settings')}><Text style={[styles.menuText, { color: theme.text, fontFamily: fonts.display }]}>Settings</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Logout" style={styles.menuAction} onPress={() => void logout()} disabled={logoutPending}><Text style={[styles.menuText, { color: '#f87171', fontFamily: fonts.display }]}>{logoutPending ? 'Logging out…' : 'Logout'}</Text></Pressable>
            {logoutError && <Text accessibilityRole="alert" style={styles.error}>{logoutError}</Text>}
          </Pressable>
        </Pressable>
      </Modal>
      {sheet === 'profile' && <ProfileSheet onClose={() => setSheet(null)} />}
      <Modal visible={sheet === 'settings'} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <View style={[styles.settingsRoot, { backgroundColor: theme.body, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.settingsHeading, { backgroundColor: theme.nav, borderBottomColor: theme.navBorder }]}>
          <Text accessible accessibilityRole="header" style={[styles.sheetTitle, { color: theme.text, fontFamily: fonts.display }]}>SETTINGS</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close Settings" onPress={() => setSheet(null)}><Text style={[styles.close, { color: theme.muted }]}>×</Text></Pressable>
          </View>
          <SettingsContent onClose={() => setSheet(null)} embedded />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 62, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', rowGap: 8, borderBottomWidth: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }, brandMark: { minWidth: 32, minHeight: 32, paddingHorizontal: 4, paddingVertical: 3, borderRadius: 9, borderWidth: 1.5, textAlign: 'center', textAlignVertical: 'center', fontSize: 17, fontWeight: '700' }, brandText: { fontSize: 17, letterSpacing: 2 },
  accountTrigger: { maxWidth: '58%', minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7, padding: 3, flexShrink: 1 }, avatar: { minWidth: 30, minHeight: 30, paddingHorizontal: 3, paddingVertical: 3, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, avatarText: { fontSize: 11, fontWeight: '700' }, accountCopy: { flex: 1, minWidth: 0 }, accountName: { fontSize: 13 }, accountClass: { fontSize: 10, marginTop: 1 }, rank: { minWidth: 27, minHeight: 27, paddingHorizontal: 3, paddingVertical: 2, borderWidth: 1.5, borderRadius: 7, textAlign: 'center', textAlignVertical: 'center', fontFamily: 'Rajdhani_700Bold', fontSize: 13, flexShrink: 0 },
  menuOverlay: { flex: 1, alignItems: 'flex-end', paddingTop: 68, paddingHorizontal: 14 }, menu: { width: 210, borderRadius: 8, borderWidth: 1, padding: 8 }, menuHeading: { fontSize: 11, letterSpacing: 1.5, paddingHorizontal: 10, paddingVertical: 7 }, menuAction: { paddingHorizontal: 10, paddingVertical: 13 }, menuText: { fontSize: 14, letterSpacing: 0.5 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' }, sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, padding: 20, paddingBottom: 30 }, sheetHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 22 }, sheetTitle: { fontSize: 20, letterSpacing: 1 }, close: { fontSize: 28, lineHeight: 28 }, fieldLabel: { fontSize: 11, letterSpacing: 1.2, marginBottom: 6, marginTop: 12 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, fontFamily: 'Inter_400Regular', fontSize: 15 }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 18, marginTop: 24 }, saveButton: { minHeight: 44, borderWidth: 1, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 9, justifyContent: 'center' }, promptOverlay: { flex: 1, justifyContent: 'center', padding: 20 }, promptCard: { width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: 1, borderRadius: 14, padding: 22 }, promptText: { fontSize: 14, lineHeight: 21, marginTop: 10 }, promptButton: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 24, paddingHorizontal: 14 }, actionText: { fontSize: 12, letterSpacing: 1 }, error: { color: '#f87171', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 12 }, settingsRoot: { flex: 1 }, settingsHeading: { minHeight: 62, paddingHorizontal: 18, paddingVertical: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottomWidth: 1 },
});
