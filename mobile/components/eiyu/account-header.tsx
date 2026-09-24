import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatError, normalizeProfileEdit, RANK_CONFIG } from '@eiyu/shared';

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

  useEffect(() => {
    setDisplayName(user.name);
    setUserClass(user.userClass);
    setError(null);
  }, [user.name, user.userClass]);

  const save = async () => {
    try {
      setError(null);
      const normalized = normalizeProfileEdit({ displayName, userClass });
      setPending(true);
      await saveProfile(normalized);
      onClose();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalRoot, { backgroundColor: theme.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: theme.modal, borderColor: theme.glassBorder, paddingBottom: 30 + insets.bottom }]}>
          <View style={styles.sheetHeading}>
            <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: fonts.display }]}>EDIT DETAILS</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close Edit details" onPress={onClose}><Text style={[styles.close, { color: theme.muted }]}>×</Text></Pressable>
          </View>
          <Text style={[styles.fieldLabel, { color: theme.muted, fontFamily: fonts.display }]}>DISPLAY NAME</Text>
          <TextInput accessibilityLabel="Display name" value={displayName} onChangeText={setDisplayName} maxLength={80} autoFocus style={[styles.input, { color: theme.text, borderColor: theme.glassBorder, backgroundColor: theme.track }]} />
          <Text style={[styles.fieldLabel, { color: theme.muted, fontFamily: fonts.display }]}>CLASS</Text>
          <TextInput accessibilityLabel="Class" value={userClass} onChangeText={setUserClass} maxLength={80} style={[styles.input, { color: theme.text, borderColor: theme.glassBorder, backgroundColor: theme.track }]} />
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} disabled={pending}><Text style={[styles.actionText, { color: theme.muted, fontFamily: fonts.display }]}>CANCEL</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={pending ? 'Saving' : 'Save'} onPress={() => void save()} disabled={pending} style={[styles.saveButton, { borderColor: theme.accentBorder, backgroundColor: theme.accentGlass }]}><Text style={[styles.actionText, { color: theme.accent, fontFamily: fonts.display }]}>{pending ? 'SAVING…' : 'SAVE'}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function AccountHeader() {
  const { user, theme } = useEiyu();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
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
        <View style={styles.brand}><Text style={[styles.brandMark, { color: theme.accent, borderColor: theme.accentBorder, backgroundColor: theme.accentGlass }]}>英</Text><Text style={[styles.brandText, { color: theme.text, fontFamily: fonts.display }]}>EIYU</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={accountLabel} accessibilityHint="Open account menu" onPress={() => { setLogoutError(null); setSheet('menu'); }} style={styles.accountTrigger}>
          <View style={[styles.avatar, { backgroundColor: theme.accentGlass, borderColor: theme.accentBorder }]}><Text style={[styles.avatarText, { color: theme.accent, fontFamily: fonts.display }]}>{user.name.split(' ').map(n => n[0]).join('').slice(0, 3)}</Text></View>
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
            <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: fonts.display }]}>SETTINGS</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close Settings" onPress={() => setSheet(null)}><Text style={[styles.close, { color: theme.muted }]}>×</Text></Pressable>
          </View>
          <SettingsContent onClose={() => setSheet(null)} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 62, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 }, brandMark: { width: 32, height: 32, borderRadius: 9, borderWidth: 1.5, textAlign: 'center', textAlignVertical: 'center', fontSize: 17, fontWeight: '700' }, brandText: { fontSize: 17, letterSpacing: 2 },
  accountTrigger: { maxWidth: '58%', flexDirection: 'row', alignItems: 'center', gap: 7, padding: 3 }, avatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 11, fontWeight: '700' }, accountCopy: { flexShrink: 1 }, accountName: { fontSize: 13 }, accountClass: { fontSize: 10, marginTop: 1 }, rank: { width: 27, height: 27, borderWidth: 1.5, borderRadius: 7, textAlign: 'center', textAlignVertical: 'center', fontFamily: 'Rajdhani_700Bold', fontSize: 13 },
  menuOverlay: { flex: 1, alignItems: 'flex-end', paddingTop: 68, paddingHorizontal: 14 }, menu: { width: 210, borderRadius: 8, borderWidth: 1, padding: 8 }, menuHeading: { fontSize: 11, letterSpacing: 1.5, paddingHorizontal: 10, paddingVertical: 7 }, menuAction: { paddingHorizontal: 10, paddingVertical: 13 }, menuText: { fontSize: 14, letterSpacing: 0.5 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' }, sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, padding: 20, paddingBottom: 30 }, sheetHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }, sheetTitle: { fontSize: 20, letterSpacing: 1 }, close: { fontSize: 28, lineHeight: 28 }, fieldLabel: { fontSize: 11, letterSpacing: 1.2, marginBottom: 6, marginTop: 12 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, fontFamily: 'Inter_400Regular', fontSize: 15 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18, marginTop: 24 }, saveButton: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 9 }, actionText: { fontSize: 12, letterSpacing: 1 }, error: { color: '#f87171', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 12 }, settingsRoot: { flex: 1 }, settingsHeading: { minHeight: 62, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
});
