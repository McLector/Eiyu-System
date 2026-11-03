import {useEffect, useRef, useState} from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import {useLocalSearchParams, useRouter} from 'expo-router';
import {beginPasswordRecovery, RECOVERY_LINK_ERROR, saveRecoveredPassword, type RecoveryAuth} from '@eiyu/shared';
import {Screen} from '@/components/eiyu/screen';
import {Button} from '@/components/ui/button';
import {PasswordField} from '@/components/ui/password-field';
import {SignaturePanel} from '@/components/ui/signature-panel';
import {fonts} from '@/constants/eiyu-theme';
import {useTokens} from '@/contexts/theme-store';
import {createRecoveryAuth, supabase} from '@/lib/supabase';
import {consumeRecoveryLink} from '@/lib/recovery-link';

async function currentOwner() {
 const {data, error} = await supabase.auth.getSession();
 if (error) throw new Error('Account status unavailable');
 return data.session?.user.id ?? null;
}

export default function RecoveryScreen() {
 const params = useLocalSearchParams<{attempt?: string | string[]}>();
 const id = typeof params.attempt === 'string' ? params.attempt : undefined;
 return <RecoveryAttempt key={id ?? 'missing'} id={id}/>;
}

function RecoveryAttempt({id}: {id: string | undefined}) {
 const t = useTokens(), router = useRouter();
 const attempt = useRef<{auth: RecoveryAuth | null; ready: Promise<string>} | null>(null);
 const mounted = useRef(false), saving = useRef(false);
 const [owner, setOwner] = useState<string | null>(null);
 const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
 const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
 const [result, setResult] = useState<{cleanupFailed: boolean} | null>(null);

 useEffect(() => {
  mounted.current = true;
  if (!attempt.current) {
   try {
    const tokens = consumeRecoveryLink(id);
    const auth = createRecoveryAuth();
    attempt.current = {auth, ready: beginPasswordRecovery(auth, tokens, currentOwner)};
   } catch {attempt.current = {auth: null, ready: Promise.reject(new Error(RECOVERY_LINK_ERROR))};}
  }
  let active = true;
  void attempt.current.ready.then(value => {if (active) setOwner(value);})
   .catch(err => {if (active) setError(err instanceof Error ? err.message : RECOVERY_LINK_ERROR);});
  return () => {active = false; mounted.current = false;};
 }, [id]);

 const submit = async () => {
  if (saving.current || !owner || !attempt.current?.auth || result) return;
  saving.current = true; setBusy(true); setError(null);
  try {
   const saved = await saveRecoveredPassword(attempt.current.auth, owner, password, confirmation, currentOwner);
   if (mounted.current) {setPassword(''); setConfirmation(''); setResult(saved);}
  } catch (err) {if (mounted.current) setError(err instanceof Error ? err.message : RECOVERY_LINK_ERROR);}
  finally {saving.current = false; if (mounted.current) setBusy(false);}
 };

 const body = {fontFamily: fonts.body, color: t.text};
 return <View style={[styles.root, {backgroundColor: t['page-flat']}]}>
  <Screen edges={['top', 'bottom']} contentContainerStyle={styles.screen}>
   <SignaturePanel style={styles.card}>
    <AppText accessibilityRole="header" style={[body, styles.title]}>{result ? 'Password updated' : 'Reset your password'}</AppText>
    {result ? <AppText style={body}>Your password has been updated. {result.cleanupFailed ? 'The recovery session could not be closed on the server. Close this page and sign in again.' : 'You can now sign in with your new password.'}</AppText> : <>
     {error && <AppText accessibilityRole="alert" style={[body, {color: t.danger}]}>{error}</AppText>}
     {!owner && !error && <AppText style={body}>Checking recovery link…</AppText>}
     {owner && <>
      <PasswordField label="New password" value={password} onChangeText={setPassword} editable={!busy} autoComplete="new-password"/>
      <PasswordField label="Confirm new password" value={confirmation} onChangeText={setConfirmation} editable={!busy} autoComplete="new-password"/>
      <Button variant="primary" label="SAVE NEW PASSWORD" busy={busy} onPress={() => void submit()}/>
     </>}
    </>}
    <Button variant="secondary" label="Back to sign in" onPress={() => router.replace('/')}/>
   </SignaturePanel>
  </Screen>
 </View>;
}
const styles = StyleSheet.create({root: {flex: 1}, screen: {flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24}, card: {padding: 20, gap: 16}, title: {fontSize: 24}});
