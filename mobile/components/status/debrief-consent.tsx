import {useEffect, useRef, useState} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import {
  ADULT_NOTICE_VERSION, AI_NOTICE_VERSION, PROCESSING_NOTICES, fetchMailboxStatus, fetchProcessingAccess,
  formatError, setProcessingConsent, type ProcessingAccess,
} from '@eiyu/shared';
import {MailboxVerification} from '@/components/status/mailbox-verification';
import {fonts} from '@/constants/eiyu-theme';
import {useTokens} from '@/contexts/theme-store';

type Props = {userId: string; access: ProcessingAccess; onChanged?: (status: ProcessingAccess) => void};

const ADULT_HINT = 'This is your own statement and we do not check it. Eiyu keeps only that you said yes, and the date.';

/** The server reports a stale decision with code EP002; Supabase errors are plain objects, not Error instances. */
function isStale(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as {code: unknown}).code === 'EP002';
}

/**
 * "Turn on AI weekly review": the 18+ box, the AI agreement, and a verified email, then one Turn on button.
 * The 18+ answer is saved first and the AI agreement second, using the access the first save returned.
 */
export function DebriefConsent({userId, access, onChanged}: Props) {
  const t = useTokens();
  const [adult, setAdult] = useState(false), [agreed, setAgreed] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const latest = useRef({userId, onChanged});
  latest.current = {userId, onChanged};
  const owner = useRef(0);

  // A different account starts over. So does turning a permission off again: the card comes back unticked.
  useEffect(() => {
    owner.current++; setAdult(false); setAgreed(false); setVerified(null); setBusy(false); setError(null);
  }, [userId]);
  useEffect(() => { setAdult(false); }, [access.ageConsent]);
  useEffect(() => { setAgreed(false); }, [access.aiConsent]);

  const needsAdult = !access.ageConsent;
  const done = access.ageConsent && access.aiConsent;
  const mine = userId === access.userId;

  useEffect(() => {
    if (!mine || done) return;
    const current = owner.current;
    fetchMailboxStatus().then(status => {
      if (owner.current === current && status.userId === userId) setVerified(status.verified);
    }).catch(() => { if (owner.current === current) setVerified(false); });
  }, [mine, done, userId, access.mailboxVersion]);

  if (!mine) return <AppText accessibilityRole="alert">Permission settings are unavailable for this account.</AppText>;
  if (done) return null;

  const ready = verified === true && agreed && (adult || !needsAdult);
  const turnOn = async () => {
    if (busy || !ready) return;
    const current = owner.current, captured = {...access};
    const stillThisAccount = () => latest.current.userId === userId && owner.current === current;
    setBusy(true); setError(null);
    let latestAccess = captured;
    try {
      // One decision, two saves. After the first save the account's revisions have moved on by design, and the
      // screen may re-read access, so the second save only checks that it is still the same account.
      if (needsAdult) {
        latestAccess = await setProcessingConsent('age-screening', true, ADULT_NOTICE_VERSION, captured);
        if (!stillThisAccount()) return;
      }
      latestAccess = await setProcessingConsent('weekly-debrief', true, AI_NOTICE_VERSION, latestAccess);
      if (stillThisAccount() && latestAccess.userId === userId) latest.current.onChanged?.(latestAccess);
    } catch (err) {
      if (!stillThisAccount()) return;
      setError(formatError(err));
      // A stale save: read access again and show what the account says now. If that read fails, fall back to the
      // access the first save returned (the 18+ answer was saved even though the AI agreement was not).
      let shown: ProcessingAccess | null = latestAccess !== captured ? latestAccess : null;
      if (isStale(err)) {
        try { shown = await fetchProcessingAccess(); } catch { /* The refresh message stays; the next read will catch up. */ }
        if (!stillThisAccount()) return;
      }
      if (shown && shown.userId === userId) latest.current.onChanged?.(shown);
    } finally {
      if (owner.current === current) setBusy(false);
    }
  };

  const body = {fontFamily: fonts.body, color: t['muted-flat'], fontSize: 13, lineHeight: 20};
  const box = (label: string, checked: boolean, toggle: () => void) => (
    <Pressable role="checkbox" aria-label={label} accessibilityState={{checked, disabled: busy}}
      disabled={busy} onPress={toggle} style={[styles.choice, busy && styles.disabled]}>
      <AppText aria-hidden style={{color: t['accent-text'], fontSize: 20}}>{checked ? '☑' : '☐'}</AppText>
      <AppText style={[body, styles.label]}>{label}</AppText>
    </Pressable>
  );
  return <View style={styles.container}>
    <AppText accessibilityRole="header" style={{fontFamily: fonts.display, color: t['accent-text'], fontSize: 14, letterSpacing: 1}}>Turn on AI weekly review</AppText>
    <AppText selectable style={body}>{PROCESSING_NOTICES['weekly-debrief'].body}</AppText>
    {needsAdult ? <>
      {box(PROCESSING_NOTICES['age-screening'].label, adult, () => setAdult(value => !value))}
      <AppText style={body}>{ADULT_HINT}</AppText>
    </> : null}
    {box(PROCESSING_NOTICES['weekly-debrief'].label, agreed, () => setAgreed(value => !value))}
    {verified === false ? <MailboxVerification key={userId} userId={userId} onVerified={() => setVerified(true)}/> : null}
    {verified === null ? <AppText accessibilityRole="text" style={body}>Checking verification status…</AppText> : null}
    {ready ? <Button variant="primary" label="Turn on" disabled={busy} onPress={() => void turnOn()}/> : null}
    {busy ? <AppText accessibilityRole="text" style={body}>Saving…</AppText> : null}
    {error ? <AppText accessibilityRole="alert" style={[body, {color: t.danger}]}>{error}</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({container: {gap: 8}, choice: {minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10}, label: {flex: 1}, disabled: {opacity: 0.6}});
