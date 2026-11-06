import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  authErrorMessage,
  confirmEmailMessage,
  LEGAL_DOCUMENTS,
  MIN_PASSWORD_LENGTH,
  normalizeNameBoundaries,
  passwordStrength,
  resetLinkSentMessage,
  validateConfirmPassword,
  validateSignupBirthday,
  CHILD_PRIVACY_NOTICE,
  GOOGLE_GENERIC_MESSAGE,
  PROCESSING_NOTICES,
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
import { authDensity } from '@/lib/auth-density';

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
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const density = authDensity(windowHeight - insets.top - insets.bottom, fontScale);
  const { signIn, signUp, resetPassword, signInWithGoogle, googleMessage, clearGoogleMessage } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [ageConsent, setAgeConsent] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const activeLegalDocument = legalDocument ? LEGAL_DOCUMENTS[legalDocument] : null;

  /** Switch auth mode without leaking submit-state, stale errors, or secrets across forms. Password, confirmation and
   * consent are cleared on purpose: a login-typed password pre-filling signup would create an account with a secret the
   * user never knowingly entered there, and a ticked consent box carried over would record an agreement that never
   * happened. The email stays: it is the same person. */
  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    clearGoogleMessage();
    setAttempted(false);
    setPassword('');
    setConfirm('');
    setBirthday('');
    setAcceptedTerms(false);
    setAgeConsent(false);
  };

  const fieldErrors = useMemo(
    () => ({
      name: mode === 'signup' ? validateDisplayName(name) : null,
      birthday: mode === 'signup' ? validateSignupBirthday(birthday) : null,
      email: validateEmail(email),
      password: mode !== 'forgot' ? validatePassword(password) : null,
      confirm: mode === 'signup' ? validateConfirmPassword(password, confirm) : null,
    }),
    [mode, name, birthday, email, password, confirm],
  );
  const termsMissing = mode === 'signup' && !acceptedTerms;
  const ageConsentMissing = mode === 'signup' && !ageConsent;
  const valid = !Object.values(fieldErrors).some(Boolean) && !termsMissing && !ageConsentMissing;
  const shown = (key: keyof typeof fieldErrors) => (attempted ? fieldErrors[key] ?? undefined : undefined);

  const score = passwordStrength(mode === 'signup' ? password : '');
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const strengthColor = tooShort ? t.danger : score === 0 ? t.danger : score === 1 ? t.warning : t.success;

  /** Google needs no typed fields or ticked boxes here: the birthday and consent come on the finish screen. */
  const handleGoogle = async () => {
    if (googleBusy || submitting) return;
    setError(null);
    setGoogleBusy(true);
    try {
      const { error: err } = await signInWithGoogle();
      if (err) setError(err);
    } catch {
      setError(GOOGLE_GENERIC_MESSAGE);
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (submitting || googleBusy) return;
    setAttempted(true);
    if (!valid) return;
    setError(null);
    clearGoogleMessage();
    setSubmitting(true);
    try {
      if (mode === 'forgot') {
        const { error: err } = await resetPassword(email.trim());
        if (err) setError(authErrorMessage('forgot', err));
        else setNotice({ icon: 'mail', title: 'MESSAGE DISPATCHED', message: resetLinkSentMessage(email.trim()) });
        return;
      }
      if (mode === 'signup') {
        const { error: err, needsEmailConfirmation } = await signUp(email.trim(), password, normalizeNameBoundaries(name), birthday, ageConsent);
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
      <Screen edges={['top', 'bottom']} contentContainerStyle={[styles.scroll, { paddingVertical: density.scrollPadV }]}>
        <View style={[styles.brand, { marginBottom: density.brandMargin }]}>
          <View
            testID="auth-logo"
            style={[
              styles.logo,
              { width: density.logoSize, height: density.logoSize, marginBottom: density.logoGap, backgroundColor: t['accent-glass'], borderColor: t['accent-border'] },
            ]}>
            <BrandMark testID="auth-brand-mark" style={[styles.logoGlyph, { fontSize: density.logoGlyph, color: t['accent-text'], fontFamily: fonts.display }]}>英</BrandMark>
          </View>
          <AppText accessibilityRole="header" style={[styles.title, { fontSize: density.titleSize, color: t.text, fontFamily: fonts.display }]}>EIYU SYSTEM</AppText>
          <AppText style={[styles.subtitle, { color: t['muted-flat'], fontFamily: fonts.body }]}>{SUBTITLES[mode]}</AppText>
        </View>

        <SignaturePanel
          style={[styles.card, { paddingHorizontal: density.cardPadX, paddingTop: density.cardPadTop, paddingBottom: density.cardPadBottom }]}>
          <View style={[styles.accentLine, { marginBottom: density.accentGap, backgroundColor: t.accent }]} />
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
              <AppText accessibilityRole="header" style={[styles.noticeTitle, { color: t['accent-text'], fontFamily: fonts.display }]}>{notice.title}</AppText>
              <AppText style={[styles.noticeBody, { color: t['muted-flat'], fontFamily: fonts.body }]}>{notice.message}</AppText>
              <Button variant="secondary" label="BACK TO LOGIN" onPress={backToLogin} style={styles.full} />
            </View>
          ) : (
            <View testID="auth-form" style={[styles.form, { gap: density.formGap }]}>
              {mode === 'signup' ? (
                <Field label="Display name" placeholder="Kaito Mizuru" autoCapitalize="words" value={name} onChangeText={setName} error={shown('name')} />
              ) : null}
              {mode === 'signup' ? (
                <View style={{gap: 8}}>
                  <AppText selectable style={[styles.noticeBody, {color: t['muted-flat'], fontFamily: fonts.body}]}>{CHILD_PRIVACY_NOTICE}</AppText>
                  <AppText selectable style={[styles.noticeBody, {color: t['muted-flat'], fontFamily: fonts.body}]}>{PROCESSING_NOTICES['age-screening'].body}</AppText>
                  <Pressable accessibilityRole="checkbox" accessibilityLabel={PROCESSING_NOTICES['age-screening'].label}
                    accessibilityState={{checked: ageConsent}} onPress={() => setAgeConsent(v => !v)} style={[styles.terms, {minHeight: 48, alignItems: 'center'}]}>
                    <AppText aria-hidden style={{color: t['accent-text'], fontSize: 22}}>{ageConsent ? '☑' : '☐'}</AppText>
                    <AppText style={[styles.termsText, {flex: 1, color: t['muted-flat'], fontFamily: fonts.body}]}>{PROCESSING_NOTICES['age-screening'].label}</AppText>
                  </Pressable>
                  {attempted && ageConsentMissing ? <AppText accessibilityRole="alert" style={[styles.note, {color: t.danger}]}>Review the birthday notice and give specific permission before signup.</AppText> : null}
                <Field label="Birthday" placeholder="YYYY-MM-DD" autoCapitalize="none" value={birthday} onChangeText={setBirthday} error={shown('birthday')} />
                </View>
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
                      <AppText style={[styles.strengthLabel, { color: strengthColor, fontFamily: fonts.body }]}>
                        {tooShort ? 'Too short' : STRENGTH_LABELS[score]}
                      </AppText>
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
                      <AppText style={[styles.termsText, { color: t['muted-flat'], fontFamily: fonts.body }]}>I agree to the</AppText>
                      <View style={styles.links}>
                        <Pressable role="link" aria-label="Privacy Policy" onPress={() => setLegalDocument('privacy')} style={styles.linkTarget}>
                          <AppText style={linkStyle}>Privacy Policy</AppText>
                        </Pressable>
                        <AppText style={[styles.termsText, { color: t['muted-flat'], fontFamily: fonts.body }]}>and</AppText>
                        <Pressable role="link" aria-label="Terms of Use" onPress={() => setLegalDocument('terms')} style={styles.linkTarget}>
                          <AppText style={linkStyle}>Terms of Use</AppText>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                  {attempted && termsMissing ? (
                    <AppText accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>
                      Accept the Privacy Policy and Terms to continue.
                    </AppText>
                  ) : null}
                </View>
              ) : null}
              {mode === 'login' ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Forgot password?" onPress={() => switchMode('forgot')} style={styles.forgot}>
                  <AppText style={[styles.note, { color: t['dim-flat'], fontFamily: fonts.body }]}>Forgot password?</AppText>
                </Pressable>
              ) : null}
              {error ?? googleMessage ? <AppText accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>{error ?? googleMessage}</AppText> : null}
              <Button
                variant="primary"
                label={submitting ? 'WORKING…' : SUBMIT_LABELS[mode]}
                busy={submitting}
                onPress={() => void handleSubmit()}
                style={styles.full}
              />
              {mode !== 'forgot' ? (
                <View style={styles.google}>
                  <View style={styles.orRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <View style={[styles.orLine, { backgroundColor: t['glass-border'] }]} />
                    <AppText style={[styles.note, { color: t['dim-flat'], fontFamily: fonts.body }]}>or</AppText>
                    <View style={[styles.orLine, { backgroundColor: t['glass-border'] }]} />
                  </View>
                  <Button
                    variant="secondary"
                    label="CONTINUE WITH GOOGLE"
                    busy={googleBusy}
                    disabled={submitting}
                    onPress={() => void handleGoogle()}
                    style={styles.full}
                  />
                  {mode === 'signup' ? (
                    <AppText style={[styles.note, styles.googleNote, { color: t['muted-flat'], fontFamily: fonts.body }]}>
                      You&apos;ll confirm your birthday right after Google.
                    </AppText>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
        </SignaturePanel>

        {!notice ? (
          <View style={[styles.switchRow, { marginTop: density.switchGap }]}>
            {mode !== 'forgot' ? (
              <AppText style={[styles.switchText, { color: t['dim-flat'], fontFamily: fonts.body }]}>{mode === 'login' ? 'New adventurer?' : 'Already enrolled?'}</AppText>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              style={styles.linkTarget}>
              <AppText style={linkStyle}>{mode === 'login' ? 'Register' : mode === 'signup' ? 'Sign in' : 'Back to login'}</AppText>
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
            <AppText style={[styles.sectionTitle, { color: t['accent-text'], fontFamily: fonts.display }]}>{section.heading}</AppText>
            <AppText selectable style={[styles.sectionBody, { color: t['muted-flat'], fontFamily: fonts.body }]}>{section.body}</AppText>
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
  google: { gap: 10 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orLine: { flex: 1, height: 1 },
  googleNote: { textAlign: 'center' },
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
