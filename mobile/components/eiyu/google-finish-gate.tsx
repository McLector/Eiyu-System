import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  CHILD_PRIVACY_NOTICE,
  LEGAL_DOCUMENTS,
  PROCESSING_NOTICES,
  fetchAccountAge,
  fetchProcessingAccess,
  finishGoogleSignup,
  formatError,
  needsGoogleSignupFinish,
  validateSignupBirthday,
  type LegalDocumentId,
  type ProcessingAccess,
} from '@eiyu/shared';

import { Screen } from '@/components/eiyu/screen';
import { Button } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { SignaturePanel } from '@/components/ui/signature-panel';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface GateUser { id: string; app_metadata?: { provider?: unknown; [key: string]: unknown } | null }
interface Props { user: GateUser; onSignOut: () => Promise<unknown>; children: ReactNode }

type Status = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' };

function Shell({ children }: { children: ReactNode }) {
  const t = useTokens();
  return (
    <View style={[styles.root, { backgroundColor: t['page-flat'] }]}>
      <Screen edges={['top', 'bottom']} contentContainerStyle={styles.screen}>
        <SignaturePanel style={styles.card}>{children}</SignaturePanel>
      </Screen>
    </View>
  );
}

function SignOutButton({ onSignOut }: { onSignOut: () => Promise<unknown> }) {
  return <Button variant="quiet" label="Sign out" onPress={() => { void Promise.resolve(onSignOut()).catch(() => {}); }} />;
}

function FinishSignup({ initialAccess, onDone, onSignOut }: {
  initialAccess: ProcessingAccess; onDone: () => void; onSignOut: () => Promise<unknown>;
}) {
  const t = useTokens();
  const notice = PROCESSING_NOTICES['age-screening'];
  // Kept in memory only. A birth date is never written to device storage.
  const [birthday, setBirthday] = useState('');
  const [consent, setConsent] = useState(false);
  // Never pre-ticked, even for an account that already gave the birthday permission.
  const [terms, setTerms] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(null);
  const activeLegalDocument = legalDocument ? LEGAL_DOCUMENTS[legalDocument] : null;
  const access = initialAccess;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const consented = consent || access.ageConsent;
  const body = [styles.body, { color: t['muted-flat'], fontFamily: fonts.body }];
  const link = [styles.body, styles.link, { color: t['accent-text'], fontFamily: fonts.body }];

  const submit = async () => {
    if (saving.current) return;
    const birthdayError = validateSignupBirthday(birthday);
    if (!consented) { setError('Review the birthday notice and give specific permission before finishing.'); return; }
    if (!terms) { setError('Accept the Privacy Policy and Terms to continue.'); return; }
    if (birthdayError) { setError(birthdayError); return; }
    saving.current = true; setBusy(true); setError(null);
    try {
      // One call saves the permission and the birthday together: a failure keeps neither, and a retry is the same call.
      await finishGoogleSignup(birthday, access);
      if (mounted.current) onDone();
    } catch (err) {
      if (mounted.current) setError(formatError(err));
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Shell>
      <AppText accessibilityRole="header" style={[styles.title, { color: t['accent-text'], fontFamily: fonts.display }]}>Finish signing up</AppText>
      <AppText style={body}>Your Google account is connected. Confirm your birthday to start using Eiyu.</AppText>
      <AppText selectable style={body}>{CHILD_PRIVACY_NOTICE}</AppText>
      <AppText selectable style={body}>{notice.body}</AppText>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={notice.label}
        accessibilityState={{ checked: consented, disabled: busy || access.ageConsent }}
        disabled={busy || access.ageConsent}
        onPress={() => setConsent(v => !v)}
        style={styles.check}>
        <AppText aria-hidden style={{ color: t['accent-text'], fontSize: 22 }}>{consented ? '☑' : '☐'}</AppText>
        <AppText style={[body, styles.checkLabel]}>{notice.label}</AppText>
      </Pressable>
      <View style={styles.check}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel="I agree to the Privacy Policy & Terms"
          accessibilityState={{ checked: terms, disabled: busy }}
          disabled={busy}
          onPress={() => setTerms(v => !v)}
          style={styles.box}>
          <AppText aria-hidden style={{ color: t['accent-text'], fontSize: 22 }}>{terms ? '☑' : '☐'}</AppText>
        </Pressable>
        <View style={styles.termsCopy}>
          <AppText style={body}>I agree to the</AppText>
          <Pressable role="link" aria-label="Privacy Policy" onPress={() => setLegalDocument('privacy')} style={styles.linkTarget}>
            <AppText style={link}>Privacy Policy</AppText>
          </Pressable>
          <AppText style={body}>and</AppText>
          <Pressable role="link" aria-label="Terms of Use" onPress={() => setLegalDocument('terms')} style={styles.linkTarget}>
            <AppText style={link}>Terms of Use</AppText>
          </Pressable>
        </View>
      </View>
      <Field label="Birthday" placeholder="YYYY-MM-DD" autoCapitalize="none" value={birthday} onChangeText={setBirthday} editable={!busy} />
      {error ? <AppText accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>{error}</AppText> : null}
      <Button variant="primary" label={busy ? 'SAVING…' : 'FINISH SIGN-UP'} busy={busy} onPress={() => void submit()} />
      <SignOutButton onSignOut={onSignOut} />
      <Sheet
        visible={activeLegalDocument !== null}
        title={activeLegalDocument?.title}
        closeLabel={`Close ${activeLegalDocument?.title ?? 'document'}`}
        onClose={() => setLegalDocument(null)}
        testID="legal-sheet">
        {activeLegalDocument?.sections.map(section => (
          <View key={section.heading} style={styles.section}>
            <AppText style={[styles.sectionTitle, { color: t['accent-text'], fontFamily: fonts.display }]}>{section.heading}</AppText>
            <AppText selectable style={body}>{section.body}</AppText>
          </View>
        ))}
      </Sheet>
    </Shell>
  );
}

/**
 * Blocks the app for an account Google created that has not yet confirmed its birthday. A password
 * account never reaches the lookup. Permission and birthday are saved in one call, and an account that
 * has the permission but no birthday (left by the earlier two-call screen) is shown the screen again.
 * Sign-out is always available.
 */
export function GoogleFinishGate({ user, onSignOut, children }: Props) {
  const t = useTokens();
  const isGoogle = user.app_metadata?.provider === 'google';
  const userId = user.id;
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [access, setAccess] = useState<ProcessingAccess | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // A token refresh hands over a new user object; only a different account (or a retry) may restart the lookup.
  const latestUser = useRef(user);
  latestUser.current = user;

  useEffect(() => {
    if (!isGoogle) return;
    let active = true;
    setStatus({ kind: 'loading' }); setFinishing(false); setAccess(null);
    Promise.all([fetchProcessingAccess(), fetchAccountAge()]).then(([next, age]) => {
      if (!active) return;
      if (next.userId !== userId || age.userId !== userId) throw new Error('Account status belongs to another account.');
      setAccess(next);
      setFinishing(needsGoogleSignupFinish(latestUser.current, next, age));
      setStatus({ kind: 'ready' });
    }).catch(() => { if (active) setStatus({ kind: 'error' }); });
    return () => { active = false; };
  }, [userId, isGoogle, attempt]);

  if (!isGoogle) return <>{children}</>;
  if (status.kind === 'loading') {
    return <Shell><AppText accessibilityRole="progressbar" style={[styles.body, { color: t['muted-flat'], fontFamily: fonts.body }]}>Checking your account…</AppText></Shell>;
  }
  if (status.kind === 'error') {
    return (
      <Shell>
        <AppText accessibilityRole="alert" style={[styles.body, { color: t.danger, fontFamily: fonts.body }]}>We couldn&apos;t check your account. Try again, or sign out.</AppText>
        <Button variant="primary" label="Try again" onPress={() => setAttempt(n => n + 1)} />
        <SignOutButton onSignOut={onSignOut} />
      </Shell>
    );
  }
  if (finishing && access) return <FinishSignup initialAccess={access} onDone={() => setFinishing(false)} onSignOut={onSignOut} />;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 24 },
  card: { padding: 20, gap: 14 },
  title: { fontSize: 22, letterSpacing: 0.7 },
  body: { fontSize: 13, lineHeight: 19 },
  note: { fontSize: 12, lineHeight: 17 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  checkLabel: { flex: 1 },
  box: { minHeight: 48, minWidth: 48, justifyContent: 'center' },
  termsCopy: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4 },
  linkTarget: { minHeight: 48, justifyContent: 'center' },
  link: { textDecorationLine: 'underline' },
  section: { marginBottom: 18, gap: 6 },
  sectionTitle: { fontSize: 13, letterSpacing: 1.3 },
});
