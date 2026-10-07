import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  authErrorMessage,
  confirmEmailMessage,
  LEGAL_DOCUMENTS,
  MIN_PASSWORD_LENGTH,
  normalizeNameBoundaries,
  passwordStrength,
  resetLinkSentMessage,
  validateConfirmPassword,
  validateDisplayName,
  validateEmail,
  validatePassword,
  type AuthMode,
  type LegalDocumentId,
} from '@eiyu/shared';

import { BrandMark } from '@/components/eiyu/brand-mark';
import { CheckIcon, MailIcon } from '@/components/eiyu/icons';
import { Screen } from '@/components/eiyu/screen';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PasswordField } from '@/components/ui/password-field';
import { Sheet } from '@/components/ui/sheet';
import { SignaturePanel } from '@/components/ui/signature-panel';
import { fonts } from '@/constants/eiyu-theme';
import { useAuth } from '@/contexts/auth-store';
import { useTokens } from '@/contexts/theme-store';

interface Notice {
  icon: 'mail' | 'check';
  title: string;
  message: string;
}

const STRENGTH_LABELS = ['Weak', 'Okay', 'Good', 'Strong'] as const;
const SUBTITLES: Record<AuthMode, string> = { login: 'Enter the system', signup: 'Begin your journey', forgot: 'Reset access' };
const SUBMIT_LABELS: Record<AuthMode, string> = { login: 'ENTER SYSTEM', signup: 'BEGIN JOURNEY', forgot: 'SEND RECOVERY LINK' };

export default function AuthScreen() {
  const t = useTokens();
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const activeLegalDocument = legalDocument ? LEGAL_DOCUMENTS[legalDocument] : null;

  /** Switch auth mode without leaking submit-state, stale errors, or secrets across forms. Password, confirmation and
   * consent are cleared on purpose: a login-typed password pre-filling signup would create an account with a secret the
   * user never knowingly entered there, and a ticked consent box carried over would record an agreement that never
   * happened. The email stays: it is the same person. */
  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setAttempted(false);
    setPassword('');
    setConfirm('');
    setAcceptedTerms(false);
  };

  const fieldErrors = useMemo(
    () => ({
      name: mode === 'signup' ? validateDisplayName(name) : null,
      email: validateEmail(email),
      password: mode !== 'forgot' ? validatePassword(password) : null,
      confirm: mode === 'signup' ? validateConfirmPassword(password, confirm) : null,
    }),
    [mode, name, email, password, confirm],
  );
  const termsMissing = mode === 'signup' && !acceptedTerms;
  const valid = !Object.values(fieldErrors).some(Boolean) && !termsMissing;
  const shown = (key: keyof typeof fieldErrors) => (attempted ? fieldErrors[key] ?? undefined : undefined);

  const score = passwordStrength(mode === 'signup' ? password : '');
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const strengthColor = tooShort ? t.danger : score === 0 ? t.danger : score === 1 ? t.warning : t.success;

  const handleSubmit = async () => {
    if (submitting) return;
    setAttempted(true);
    if (!valid) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'forgot') {
        const { error: err } = await resetPassword(email.trim());
        if (err) setError(authErrorMessage('forgot', err));
        else setNotice({ icon: 'mail', title: 'MESSAGE DISPATCHED', message: resetLinkSentMessage(email.trim()) });
        return;
      }
      if (mode === 'signup') {
        const { error: err, needsEmailConfirmation } = await signUp(email.trim(), password, normalizeNameBoundaries(name));
        if (err) setError(authErrorMessage('signup', err));
        // With no confirmation needed the session arrives and the protected stack moves to the tabs by itself.
        else if (needsEmailConfirmation) setNotice({ icon: 'check', title: 'ALMOST THERE', message: confirmEmailMessage(email.trim()) });
        return;
      }
      const { error: err } = await signIn(email.trim(), password);
      if (err) setError(authErrorMessage('login', err));
    } finally {
      setSubmitting(false);
    }
  };

  const backToLogin = () => {
    setNotice(null);
    switchMode('login');
  };

  const linkStyle = [styles.link, { color: t['accent-text'], fontFamily: fonts.body }];

  return (
    <View style={[styles.root, { backgroundColor: t['page-flat'] }]}>
      <Screen edges={['top', 'bottom']} contentContainerStyle={styles.scroll}>
        <View style={styles.brand}>
          <View style={[styles.logo, { backgroundColor: t['accent-glass'], borderColor: t['accent-border'] }]}>
            <BrandMark testID="auth-brand-mark" style={[styles.logoGlyph, { color: t['accent-text'], fontFamily: fonts.display }]}>英</BrandMark>
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>EIYU SYSTEM</Text>
          <Text style={[styles.subtitle, { color: t['muted-flat'], fontFamily: fonts.body }]}>{SUBTITLES[mode]}</Text>
        </View>

        <SignaturePanel style={styles.card}>
          <View style={[styles.accentLine, { backgroundColor: t.accent }]} />
          {notice ? (
            <View style={styles.notice}>
              <View
                testID={`auth-notice-${notice.icon}`}
                style={[
                  styles.badge,
                  notice.icon === 'mail'
                    ? { backgroundColor: t['accent-glass'], borderColor: t['accent-border'] }
                    : { backgroundColor: t['success-glass'], borderColor: t['success-border'] },
                ]}>
                {notice.icon === 'mail'
                  ? <MailIcon size={24} color={t['accent-text']} />
                  : <CheckIcon size={24} color={t.success} />}
              </View>
              <Text accessibilityRole="header" style={[styles.noticeTitle, { color: t['accent-text'], fontFamily: fonts.display }]}>{notice.title}</Text>
              <Text style={[styles.noticeBody, { color: t['muted-flat'], fontFamily: fonts.body }]}>{notice.message}</Text>
              <Button variant="secondary" label="BACK TO LOGIN" onPress={backToLogin} style={styles.full} />
            </View>
          ) : (
            <View style={styles.form}>
              {mode === 'signup' ? (
                <Field label="Display name" placeholder="Kaito Mizuru" autoCapitalize="words" value={name} onChangeText={setName} error={shown('name')} />
              ) : null}
              <Field
                label="Email address"
                placeholder="you@example.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                error={shown('email')}
              />
              {mode !== 'forgot' ? (
                <View>
                  <PasswordField
                    key={mode}
                    label="Password"
                    placeholder="••••••••"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChangeText={setPassword}
                    error={shown('password')}
                  />
                  {mode === 'signup' && password.length > 0 ? (
                    <View style={styles.strength}>
                      <View style={styles.strengthBars}>
                        {[1, 2, 3].map(seg => (
                          <View key={seg} style={[styles.strengthSeg, { backgroundColor: seg <= score ? strengthColor : t['glass-border'] }]} />
                        ))}
                      </View>
                      <Text style={[styles.strengthLabel, { color: strengthColor, fontFamily: fonts.body }]}>
                        {tooShort ? 'Too short' : STRENGTH_LABELS[score]}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {mode === 'signup' ? (
                <PasswordField
                  label="Confirm password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={confirm}
                  onChangeText={setConfirm}
                  error={shown('confirm')}
                />
              ) : null}
              {mode === 'signup' ? (
                <View>
                  <View style={styles.terms}>
                    <Pressable
                      testID="terms-checkbox"
                      accessibilityRole="checkbox"
                      accessibilityLabel="I agree to the Privacy Policy & Terms"
                      accessibilityState={{ checked: acceptedTerms }}
                      onPress={() => setAcceptedTerms(v => !v)}
                      style={styles.checkTarget}>
                      <View
                        style={[
                          styles.checkbox,
                          acceptedTerms
                            ? { borderColor: t['success-border'], backgroundColor: t['success-glass'] }
                            : { borderColor: t['accent-border'], backgroundColor: 'transparent' },
                        ]}>
                        {acceptedTerms ? <CheckIcon size={13} color={t.success} /> : null}
                      </View>
                    </Pressable>
                    <View style={styles.termsCopy}>
                      <Text style={[styles.termsText, { color: t['muted-flat'], fontFamily: fonts.body }]}>I agree to the</Text>
                      <View style={styles.links}>
                        <Pressable role="link" aria-label="Privacy Policy" onPress={() => setLegalDocument('privacy')} style={styles.linkTarget}>
                          <Text style={linkStyle}>Privacy Policy</Text>
                        </Pressable>
                        <Text style={[styles.termsText, { color: t['muted-flat'], fontFamily: fonts.body }]}>and</Text>
                        <Pressable role="link" aria-label="Terms of Use" onPress={() => setLegalDocument('terms')} style={styles.linkTarget}>
                          <Text style={linkStyle}>Terms of Use</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                  {attempted && termsMissing ? (
                    <Text accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>
                      Accept the Privacy Policy and Terms to continue.
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {mode === 'login' ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Forgot password?" onPress={() => switchMode('forgot')} style={styles.forgot}>
                  <Text style={[styles.note, { color: t['dim-flat'], fontFamily: fonts.body }]}>Forgot password?</Text>
                </Pressable>
              ) : null}
              {error ? <Text accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>{error}</Text> : null}
              <Button
                variant="primary"
                label={submitting ? 'WORKING…' : SUBMIT_LABELS[mode]}
                busy={submitting}
                onPress={() => void handleSubmit()}
                style={styles.full}
              />
            </View>
          )}
        </SignaturePanel>

        {!notice ? (
          <View style={styles.switchRow}>
            {mode !== 'forgot' ? (
              <Text style={[styles.switchText, { color: t['dim-flat'], fontFamily: fonts.body }]}>{mode === 'login' ? 'New adventurer?' : 'Already enrolled?'}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              style={styles.linkTarget}>
              <Text style={linkStyle}>{mode === 'login' ? 'Register' : mode === 'signup' ? 'Sign in' : 'Back to login'}</Text>
            </Pressable>
          </View>
        ) : null}
      </Screen>

      <Sheet
        visible={activeLegalDocument !== null}
        title={activeLegalDocument?.title}
        closeLabel={`Close ${activeLegalDocument?.title ?? 'document'}`}
        onClose={() => setLegalDocument(null)}
        testID="legal-sheet">
        {activeLegalDocument?.sections.map(section => (
          <View key={section.heading} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t['accent-text'], fontFamily: fonts.display }]}>{section.heading}</Text>
            <Text selectable style={[styles.sectionBody, { color: t['muted-flat'], fontFamily: fonts.body }]}>{section.body}</Text>
          </View>
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 32 },
  brand: { alignItems: 'center', marginBottom: 28, width: '100%', maxWidth: 440 },
  logo: { width: 56, height: 56, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  logoGlyph: { fontSize: 24 },
  title: { fontSize: 28, letterSpacing: 3 },
  subtitle: { fontSize: 13, marginTop: 6 },
  card: { width: '100%', maxWidth: 440, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 20 },
  accentLine: { height: 2, borderRadius: 1, opacity: 0.7, marginBottom: 20 },
  form: { gap: 14 },
  full: { width: '100%' },
  strength: { marginTop: 8, gap: 4 },
  strengthBars: { flexDirection: 'row', gap: 3 },
  strengthSeg: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { fontSize: 11 },
  terms: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  checkTarget: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  termsCopy: { flex: 1, minHeight: 48, justifyContent: 'center' },
  termsText: { fontSize: 13, lineHeight: 18 },
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 5 },
  linkTarget: { minHeight: 48, justifyContent: 'center' },
  link: { fontSize: 13, textDecorationLine: 'underline' },
  forgot: { alignSelf: 'flex-end', minHeight: 48, justifyContent: 'center' },
  note: { fontSize: 12, lineHeight: 17 },
  notice: { alignItems: 'center', paddingVertical: 8, gap: 6 },
  badge: { width: 56, height: 56, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  noticeTitle: { fontSize: 18, letterSpacing: 0.7 },
  noticeBody: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', columnGap: 6, marginTop: 12 },
  switchText: { fontSize: 13 },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 13, letterSpacing: 1.1, marginBottom: 6 },
  sectionBody: { fontSize: 14, lineHeight: 22 },
});
