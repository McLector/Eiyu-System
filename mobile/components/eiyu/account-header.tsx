import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { formatError, normalizeProfileEdit, profileInitials, RANK_CONFIG } from '@eiyu/shared';

import ArchivedHabitsSheet from '@/components/eiyu/archived-habits-sheet';
import { PlusIcon } from '@/components/eiyu/icons';
import SettingsContent from '@/components/eiyu/settings-content';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { fonts } from '@/constants/eiyu-theme';
import { useAuth } from '@/contexts/auth-store';
import { useEiyu } from '@/contexts/eiyu-store';
import { useTokens } from '@/contexts/theme-store';

type OpenSheet = 'menu' | 'profile' | 'settings' | 'archived' | null;
const ROUTE_SHEETS = ['profile', 'settings', 'archived'] as const;

function ProfileSheet({ onClose }: { onClose: () => void }) {
  const t = useTokens();
  const { user, saveProfile } = useEiyu();
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
      <Sheet
        visible
        title="EDIT DETAILS"
        closeLabel="Close Edit details"
        dismissible={!pending}
        keyboardAware
        onClose={requestClose}
        testID="profile-sheet"
        footer={(
          <View style={styles.actions}>
            <Button variant="quiet" label="Cancel" disabled={pending} onPress={requestClose} />
            <Button variant="primary" label={pending ? 'Saving' : 'Save'} busy={pending} onPress={() => void save()} />
          </View>
        )}>
        <View style={styles.form}>
          <Field label="Display name" value={displayName} editable={!pending} onChangeText={setDisplayName} autoFocus />
          <Field label="Class" value={userClass} editable={!pending} onChangeText={setUserClass} />
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: t.danger, fontFamily: fonts.body }]}>{error}</Text> : null}
        </View>
      </Sheet>

      <Modal
        visible={discardPrompt}
        transparent
        animationType="fade"
        testID="profile-discard-modal"
        onShow={focusKeepEditing}
        onRequestClose={() => setDiscardPrompt(false)}>
        <View style={[styles.promptOverlay, { backgroundColor: t.overlay }]}>
          <View accessibilityViewIsModal style={[styles.promptCard, { backgroundColor: t.modal, borderColor: t['accent-border'] }]}>
            <Text accessibilityRole="alert" accessibilityLabel="Discard changes?" style={[styles.promptTitle, { color: t.text, fontFamily: fonts.display }]}>Discard changes?</Text>
            <Text style={[styles.promptText, { color: t['muted-flat'], fontFamily: fonts.body }]}>Your unsaved profile changes will be lost.</Text>
            <View style={styles.actions}>
              <View ref={keepEditingRef}>
                <Button variant="secondary" label="Keep Editing" onPress={() => setDiscardPrompt(false)} />
              </View>
              <Button variant="destructive" label="Discard Changes" onPress={() => { setDiscardPrompt(false); onClose(); }} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function AccountHeader() {
  const { account } = useLocalSearchParams<{ account?: string }>();
  const t = useTokens();
  const { user } = useEiyu();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!(ROUTE_SHEETS as readonly (string | undefined)[]).includes(account)) return;
    setSheet(account as (typeof ROUTE_SHEETS)[number]);
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

  const menuItems: { label: string; onPress: () => void }[] = [
    { label: 'Edit details', onPress: () => setSheet('profile') },
    { label: 'Settings', onPress: () => setSheet('settings') },
    { label: 'Archived habits', onPress: () => setSheet('archived') },
  ];

  return (
    <>
      <View style={[styles.header, { backgroundColor: t.nav, borderBottomColor: t['nav-border'], paddingTop: insets.top }]}>
        <View style={styles.brand}>
          <Text testID="account-brand-mark" style={[styles.brandMark, { color: t['accent-text'], borderColor: t['accent-border'], backgroundColor: t['accent-glass'] }]}>英</Text>
          <Text style={[styles.brandText, { color: t.text, fontFamily: fonts.display }]}>EIYU</Text>
        </View>
        <Pressable
          testID="account-trigger"
          accessibilityRole="button"
          accessibilityLabel={accountLabel}
          accessibilityHint="Open account menu"
          onPress={() => { setLogoutError(null); setSheet('menu'); }}
          style={styles.accountTrigger}>
          <View style={[styles.avatar, { backgroundColor: t['accent-glass'], borderColor: t['accent-border'] }]}>
            <Text style={[styles.avatarText, { color: t['accent-text'], fontFamily: fonts.display }]}>{profileInitials(user.name)}</Text>
          </View>
          <View style={styles.accountCopy}>
            <Text numberOfLines={1} style={[styles.accountName, { color: t.text, fontFamily: fonts.display }]}>{user.name}</Text>
            <Text numberOfLines={1} style={[styles.accountClass, { color: t['muted-flat'], fontFamily: fonts.body }]}>{user.userClass}</Text>
          </View>
          <Text style={[styles.rank, { color: rankCfg.color, borderColor: rankCfg.color }]}>{user.rank}</Text>
        </Pressable>
      </View>

      <Sheet visible={sheet === 'menu'} title="ACCOUNT" dismissible={!logoutPending} onClose={() => setSheet(null)} testID="account-menu">
        {menuItems.map(item => (
          <Pressable key={item.label} accessibilityRole="menuitem" accessibilityLabel={item.label} onPress={item.onPress} style={[styles.menuItem, { borderBottomColor: t['divider-flat'] }]}>
            <Text style={[styles.menuText, { color: t.text, fontFamily: fonts.display }]}>{item.label}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="menuitem"
          accessibilityLabel="Logout"
          accessibilityState={{ disabled: logoutPending, busy: logoutPending }}
          disabled={logoutPending}
          onPress={() => void logout()}
          style={styles.menuItem}>
          <Text style={[styles.menuText, { color: t.danger, fontFamily: fonts.display }]}>{logoutPending ? 'Logging out…' : 'Logout'}</Text>
        </Pressable>
        {logoutError ? <Text accessibilityRole="alert" style={[styles.error, { color: t.danger, fontFamily: fonts.body }]}>{logoutError}</Text> : null}
      </Sheet>

      {sheet === 'profile' && <ProfileSheet onClose={() => setSheet(null)} />}
      <ArchivedHabitsSheet visible={sheet === 'archived'} onClose={() => setSheet(null)} />

      <Modal visible={sheet === 'settings'} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <View style={[styles.settingsRoot, { backgroundColor: t['page-flat'], paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.settingsHeading, { backgroundColor: t.nav, borderBottomColor: t['nav-border'] }]}>
            <Text accessible accessibilityRole="header" style={[styles.settingsTitle, { color: t.text, fontFamily: fonts.display }]}>SETTINGS</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close Settings" onPress={() => setSheet(null)} style={styles.settingsClose}>
              <View style={styles.closeGlyph}><PlusIcon size={20} color={t['muted-flat']} /></View>
            </Pressable>
          </View>
          <SettingsContent onClose={() => setSheet(null)} embedded />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 62, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', rowGap: 8, borderBottomWidth: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  brandMark: { minWidth: 32, minHeight: 32, paddingHorizontal: 4, paddingVertical: 3, borderRadius: 4, borderWidth: 1.5, textAlign: 'center', textAlignVertical: 'center', fontSize: 17, fontWeight: '700' },
  brandText: { fontSize: 17, letterSpacing: 2 },
  accountTrigger: { maxWidth: '58%', minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7, padding: 3, flexShrink: 1 },
  avatar: { minWidth: 30, minHeight: 30, paddingHorizontal: 3, paddingVertical: 3, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 11, fontWeight: '700' },
  accountCopy: { flex: 1, minWidth: 0 },
  accountName: { fontSize: 13 },
  accountClass: { fontSize: 10, marginTop: 1 },
  rank: { minWidth: 27, minHeight: 27, paddingHorizontal: 3, paddingVertical: 2, borderWidth: 1.5, borderRadius: 4, textAlign: 'center', textAlignVertical: 'center', fontFamily: 'Rajdhani_700Bold', fontSize: 13, flexShrink: 0 },
  menuItem: { minHeight: 52, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  menuText: { fontSize: 16, letterSpacing: 0.6 },
  form: { gap: 14, paddingTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  error: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  promptOverlay: { flex: 1, justifyContent: 'center', padding: 20 },
  promptCard: { width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: 1, borderRadius: 4, padding: 20, gap: 8 },
  promptTitle: { fontSize: 20, letterSpacing: 1 },
  promptText: { fontSize: 14, lineHeight: 21, marginBottom: 8 },
  settingsRoot: { flex: 1 },
  settingsHeading: { minHeight: 62, paddingLeft: 18, paddingRight: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  settingsTitle: { fontSize: 20, letterSpacing: 1 },
  settingsClose: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { transform: [{ rotate: '45deg' }] },
});
