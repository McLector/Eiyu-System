import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { AI_NOTICE_VERSION, fetchProcessingAccess, formatError, normalizeProfileEdit, profileInitials, RANK_CONFIG, setProcessingConsent, type ProcessingAccess } from '@eiyu/shared';
import {OwnerExport} from '@/components/eiyu/owner-export';

import ArchivedHabitsSheet from '@/components/eiyu/archived-habits-sheet';
import { BrandMark } from '@/components/eiyu/brand-mark';
import { SettingsSheet } from '@/components/settings/settings-sheet';
import { Button } from '@/components/ui/button';
import { DiscardChangesModal } from '@/components/ui/discard-changes-modal';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { fonts } from '@/constants/eiyu-theme';
import { useAuth } from '@/contexts/auth-store';
import { useEiyu } from '@/contexts/eiyu-store';
import { useTokens } from '@/contexts/theme-store';

type OpenSheet = 'menu' | 'profile' | 'settings' | 'archived' | null;
const ROUTE_SHEETS = ['profile', 'settings', 'archived'] as const;

const AI_UNAVAILABLE = 'AI weekly review settings are unavailable right now. You can still edit your name and class.';

/** The server reports a stale decision with code EP002; Supabase errors are plain objects, not Error instances. */
function isStale(err: unknown) {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code: unknown }).code === 'EP002';
}

function ProfileSheet({ onClose, userId }: { onClose: () => void; userId: string | undefined }) {
  const t = useTokens();
  const { user, saveProfile } = useEiyu();
  const [displayName, setDisplayName] = useState(user.name);
  const [userClass, setUserClass] = useState(user.userClass);
  const [processing, setProcessing] = useState<ProcessingAccess | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const saving = useRef(false);
  const turningOff = useRef(false);
  const dirty = displayName !== user.name || userClass !== user.userClass;

  const readAccess = (isActive: () => boolean) => fetchProcessingAccess().then(status => {
    if (!isActive()) return;
    if (status.userId !== userId) throw new Error(AI_UNAVAILABLE);
    setProcessing(status); setAiUnavailable(false);
  }).catch(() => { if (isActive()) { setProcessing(null); setAiUnavailable(true); } });

  useEffect(() => {
    let active = true;
    void readAccess(() => active);
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // This can only switch AI off. Turning it on needs the 18+ box and a verified email, which live on the Status screen.
  const turnOffAi = async () => {
    if (turningOff.current || !processing?.aiConsent) return;
    turningOff.current = true;
    setAiPending(true); setAiError(null);
    const owner = userId;
    try {
      const next = await setProcessingConsent('weekly-debrief', false, AI_NOTICE_VERSION, processing);
      if (next.userId !== owner || next.aiConsent) throw new Error(AI_UNAVAILABLE);
      setProcessing(next);
    } catch (err) {
      setAiError(formatError(err));
      if (isStale(err)) void readAccess(() => true);
    } finally {
      turningOff.current = false;
      setAiPending(false);
    }
  };

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
          <View style={styles.ai} accessibilityLabel="AI weekly review">
            <AppText accessibilityRole="header" style={[styles.aiTitle, { color: t.text, fontFamily: fonts.display }]}>AI weekly review</AppText>
            {aiUnavailable ? <AppText style={[styles.aiText, { color: t['muted-flat'], fontFamily: fonts.body }]}>{AI_UNAVAILABLE}</AppText> : null}
            {processing?.aiConsent ? (
              <>
                <AppText style={[styles.aiText, { color: t['muted-flat'], fontFamily: fonts.body }]}>AI weekly review is on.</AppText>
                <Button variant="secondary" label="Turn off AI weekly review" busy={aiPending} onPress={() => void turnOffAi()} />
              </>
            ) : null}
            {processing && !processing.aiConsent ? (
              <AppText style={[styles.aiText, { color: t['muted-flat'], fontFamily: fonts.body }]}>AI weekly review is off. You can turn it on from the Status page.</AppText>
            ) : null}
            {aiError ? <AppText accessibilityRole="alert" style={[styles.error, { color: t.danger, fontFamily: fonts.body }]}>{aiError}</AppText> : null}
          </View>
          {userId ? <OwnerExport key={userId} userId={userId}/> : null}
          {error ? <AppText accessibilityRole="alert" style={[styles.error, { color: t.danger, fontFamily: fonts.body }]}>{error}</AppText> : null}
        </View>
      </Sheet>

      <DiscardChangesModal
        visible={discardPrompt}
        testID="profile-discard-modal"
        message="Your unsaved profile changes will be lost."
        onKeep={() => setDiscardPrompt(false)}
        onDiscard={() => { setDiscardPrompt(false); onClose(); }}
      />
    </>
  );
}

export default function AccountHeader() {
  const { account } = useLocalSearchParams<{ account?: string }>();
  const t = useTokens();
  const { user } = useEiyu();
  const { signOut, session } = useAuth();
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
        <Pressable
          testID="account-brand-link"
          accessibilityRole="button"
          accessibilityLabel="Go to Board"
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 8 }}
          onPress={() => router.navigate({ pathname: '/(tabs)/board' })}
          style={styles.brand}>
          <BrandMark testID="account-brand-mark" style={[styles.brandMark, { color: t['accent-text'], borderColor: t['accent-border'], backgroundColor: t['accent-glass'] }]}>英</BrandMark>
          <AppText style={[styles.brandText, { color: t.text, fontFamily: fonts.display }]}>EIYU</AppText>
        </Pressable>
        <Pressable
          testID="account-trigger"
          accessibilityRole="button"
          accessibilityLabel={accountLabel}
          accessibilityHint="Open account menu"
          onPress={() => { setLogoutError(null); setSheet('menu'); }}
          style={styles.accountTrigger}>
          <View style={[styles.avatar, { backgroundColor: t['accent-glass'], borderColor: t['accent-border'] }]}>
            <AppText style={[styles.avatarText, { color: t['accent-text'], fontFamily: fonts.display }]}>{profileInitials(user.name)}</AppText>
          </View>
          <View style={styles.accountCopy}>
            <AppText numberOfLines={1} style={[styles.accountName, { color: t.text, fontFamily: fonts.display }]}>{user.name}</AppText>
            <AppText numberOfLines={1} style={[styles.accountClass, { color: t['muted-flat'], fontFamily: fonts.body }]}>{user.userClass}</AppText>
          </View>
          <AppText style={[styles.rank, { color: rankCfg.color, borderColor: rankCfg.color }]}>{user.rank}</AppText>
        </Pressable>
      </View>

      <Sheet visible={sheet === 'menu'} title="ACCOUNT" dismissible={!logoutPending} onClose={() => setSheet(null)} testID="account-menu">
        {menuItems.map(item => (
          <Pressable key={item.label} accessibilityRole="menuitem" accessibilityLabel={item.label} onPress={item.onPress} style={[styles.menuItem, { borderBottomColor: t['divider-flat'] }]}>
            <AppText style={[styles.menuText, { color: t.text, fontFamily: fonts.display }]}>{item.label}</AppText>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="menuitem"
          accessibilityLabel="Logout"
          accessibilityState={{ disabled: logoutPending, busy: logoutPending }}
          disabled={logoutPending}
          onPress={() => void logout()}
          style={styles.menuItem}>
          <AppText style={[styles.menuText, { color: t.danger, fontFamily: fonts.display }]}>{logoutPending ? 'Logging out…' : 'Logout'}</AppText>
        </Pressable>
        {logoutError ? <AppText accessibilityRole="alert" style={[styles.error, { color: t.danger, fontFamily: fonts.body }]}>{logoutError}</AppText> : null}
      </Sheet>

      {sheet === 'profile' && <ProfileSheet key={session?.user.id} userId={session?.user.id} onClose={() => setSheet(null)} />}
      <ArchivedHabitsSheet visible={sheet === 'archived'} onClose={() => setSheet(null)} />

      <SettingsSheet visible={sheet === 'settings'} onClose={() => setSheet(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 62, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', rowGap: 8, borderBottomWidth: 1 },
  brand: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
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
  ai: { gap: 8 },
  aiTitle: { fontSize: 15, letterSpacing: 0.6 },
  aiText: { fontSize: 13, lineHeight: 18 },
});
