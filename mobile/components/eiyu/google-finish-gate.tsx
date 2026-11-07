import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  LEGAL_DOCUMENTS,
  acceptTerms,
  fetchTermsStatus,
  formatError,
  needsTermsAcceptance,
  type LegalDocumentId,
} from '@eiyu/shared';

import { Screen } from '@/components/eiyu/screen';
import { Button } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { Sheet } from '@/components/ui/sheet';
import { SignaturePanel } from '@/components/ui/signature-panel';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface GateUser { id: string; app_metadata?: { provider?: unknown; [key: string]: unknown } | null }
interface Props { user: GateUser; onSignOut: () => Promise<unknown>; children: ReactNode }

type Status = 'loading' | 'ready';

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

function AcceptTermsScreen({ userId, onDone, onSignOut }: {
  userId: string; onDone: () => void; onSignOut: () => Promise<unknown>;
}) {
  const t = useTokens();
  // Never pre-ticked: the agreement has to be a choice made on this screen.
  const [terms, setTerms] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(null);
  const activeLegalDocument = legalDocument ? LEGAL_DOCUMENTS[legalDocument] : null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const body = [styles.body, { color: t['muted-flat'], fontFamily: fonts.body }];
  const link = [styles.body, styles.link, { color: t['accent-text'], fontFamily: fonts.body }];

  const submit = async () => {
    if (saving.current || !terms) return;
    saving.current = true; setBusy(true); setError(null);
    try {
      await acceptTerms(userId);
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
      <AppText style={body}>One last step: please read and accept the Privacy Policy and Terms to start using Eiyu.</AppText>
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
      {error ? <AppText accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>{error}</AppText> : null}
      <Button variant="primary" label={busy ? 'SAVING…' : 'CONTINUE'} busy={busy} disabled={!terms} onPress={() => void submit()} />
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
 * Blocks the app for an account that has no Terms acceptance on record, which today means a new Google
 * account (password sign-ups record the Terms from the sign-up form, and older accounts were backfilled).
 * The gate keys on the missing record, never on the sign-in provider. A status read that fails, or that
 * belongs to another account, opens the app: a failed read must never trap anyone behind this screen.
 * Sign-out is always available on the screen.
 */
export function GoogleFinishGate({ user, onSignOut, children }: Props) {
  const t = useTokens();
  const userId = user.id;
  const [status, setStatus] = useState<Status>('loading');
  const [needsTerms, setNeedsTerms] = useState(false);

  // A token refresh hands over a new user object; only a different account may restart the lookup.
  useEffect(() => {
    let active = true;
    setStatus('loading'); setNeedsTerms(false);
    fetchTermsStatus().then(terms => {
      if (!active) return;
      setNeedsTerms(terms.userId === userId && needsTermsAcceptance(terms));
      setStatus('ready');
    }).catch(() => {
      if (!active) return;
      setNeedsTerms(false);
      setStatus('ready');
    });
    return () => { active = false; };
  }, [userId]);

  if (status === 'loading') {
    return <Shell><AppText accessibilityRole="progressbar" style={[styles.body, { color: t['muted-flat'], fontFamily: fonts.body }]}>Checking your account…</AppText></Shell>;
  }
  if (needsTerms) return <AcceptTermsScreen userId={userId} onDone={() => setNeedsTerms(false)} onSignOut={onSignOut} />;
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
  box: { minHeight: 48, minWidth: 48, justifyContent: 'center' },
  termsCopy: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4 },
  linkTarget: { minHeight: 48, justifyContent: 'center' },
  link: { textDecorationLine: 'underline' },
  section: { marginBottom: 18, gap: 6 },
  sectionTitle: { fontSize: 13, letterSpacing: 1.3 },
});
