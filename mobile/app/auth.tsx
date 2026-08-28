import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { GhostButton } from '@/components/eiyu/ghost-button';
import { GlassView } from '@/components/eiyu/glass-view';
import { PageBackground } from '@/components/eiyu/page-background';
import { Screen } from '@/components/eiyu/screen';
import { CheckIcon } from '@/components/eiyu/icons';
import { fonts } from '@/constants/eiyu-theme';
import { useAuth } from '@/contexts/auth-store';
import { useEiyu } from '@/contexts/eiyu-store';
import {
  passwordStrength,
  validateConfirmPassword,
  validateDisplayName,
  validateEmail,
  validatePassword,
} from '@eiyu/shared';

type AuthMode = 'login' | 'signup' | 'forgot';

interface Notice {
  emoji: string;
  title: string;
  message: string;
}

const STRENGTH_LABELS = ['Weak', 'Okay', 'Good', 'Strong'] as const;
const STRENGTH_COLORS = ['#f87171', '#fbbf24', '#4ade80', '#4ade80'] as const;

export default function AuthScreen() {
  const { theme } = useEiyu();
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  /** Switch auth mode without leaking submit-state, stale errors, or secrets
   * across forms. Password/confirm/terms are cleared deliberately: a login-
   * typed password silently pre-filling signup would let an account be created
   * with a secret the user never knowingly entered there, and a ticked terms
   * box carried across modes would record an acknowledgement that never
   * happened. Email is KEPT on purpose - it's the same person registering.
   * (Found live on-device: login -> Register showed a filled password + strength meter.) */
  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    // fieldInvalid() gates on `attempted`; leaving it set would show stale
    // validation errors on the new form before the user has submitted it.
    setAttempted(false);
    setPassword('');
    setConfirm('');
    setAcceptedTerms(false);
  };

  const resetToLogin = () => {
    setNotice(null);
    switchMode('login');
  };

  /** Per-field validation (improvement-pass #13): inline errors replace the single error blob.
   * Errors only render once the user has attempted a submit, then update live. */
  const fieldErrors = useMemo(
    () => ({
      name: mode === 'signup' ? validateDisplayName(name) : null,
      email: validateEmail(email),
      password: mode !== 'forgot' ? validatePassword(password) : null,
      confirm: mode === 'signup' ? validateConfirmPassword(password, confirm) : null,
    }),
    [mode, name, email, password, confirm]
  );

  type FieldKey = keyof typeof fieldErrors;
  const fieldInvalid = (key: FieldKey) => attempted && Boolean(fieldErrors[key]);

  const strength = passwordStrength(mode === 'signup' ? password : '');

  const handleSubmit = async () => {
    setAttempted(true);
    setError(null);

    if (Object.values(fieldErrors).some(Boolean)) return;

    if (mode === 'signup' && !acceptedTerms) {
      setError('Please accept the Privacy Policy & Terms to continue.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'forgot') {
        const { error: err } = await resetPassword(email.trim());
        if (err) {
          setError(err);
          return;
        }
        setNotice({
          emoji: '📨',
          title: 'Recovery Link Sent',
          message: `Check ${email} for instructions`,
        });
        return;
      }

      if (mode === 'signup') {
        const { error: err, needsEmailConfirmation } = await signUp(
          email.trim(),
          password,
          name.trim()
        );
        if (err) {
          setError(err);
          return;
        }
        if (needsEmailConfirmation) {
          setNotice({
            emoji: '✅',
            title: 'Confirm Your Email',
            message: `We sent a confirmation link to ${email}. Sign in once you've confirmed.`,
          });
        }
        // if no confirmation needed, the session updates and Stack.Protected
        // redirects to the tabs automatically.
        return;
      }

      const { error: err } = await signIn(email.trim(), password);
      if (err) setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldStyle = {
    backgroundColor: theme.track,
    borderColor: theme.accentBorder,
    color: theme.text,
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.body }}>
      <PageBackground />
      <Screen
        edges={['top', 'bottom']}
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}>
          <View style={styles.logoWrap}>
            <View
              style={[
                styles.logoBox,
                { backgroundColor: theme.accentGlass, borderColor: theme.accentBorder },
              ]}>
              <Text style={[styles.logoGlyph, { color: theme.accent, fontFamily: fonts.display }]}>
                英
              </Text>
            </View>
            <Text style={[styles.title, { color: theme.text, fontFamily: fonts.display }]}>
              EIYU SYSTEM
            </Text>
            <Text style={[styles.subtitle, { color: theme.muted, fontFamily: fonts.body }]}>
              {mode === 'login' ? 'Enter the system' : mode === 'signup' ? 'Begin your journey' : 'Reset access'}
            </Text>
          </View>

          <GlassView style={styles.card}>
            {notice ? (
              <View style={styles.recoveryDone}>
                <Text style={styles.recoveryEmoji}>{notice.emoji}</Text>
                <Text style={[styles.recoveryTitle, { color: theme.accent, fontFamily: fonts.display }]}>
                  {notice.title}
                </Text>
                <Text style={[styles.recoverySub, { color: theme.muted, fontFamily: fonts.body }]}>
                  {notice.message}
                </Text>
                <GhostButton label="BACK TO LOGIN" onPress={resetToLogin} />
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {mode === 'signup' && (
                  <View>
                    <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>
                      DISPLAY NAME
                    </Text>
                    <TextInput
                      style={[
                        styles.field,
                        fieldStyle,
                        fieldInvalid('name') && styles.fieldErrorBorder,
                      ]}
                      placeholder="Kaito Mizuru"
                      placeholderTextColor={theme.dim}
                      autoCapitalize="words"
                      value={name}
                      onChangeText={setName}
                      accessibilityLabel="Display name"
                    />
                    {fieldInvalid('name') && (
                      <Text style={styles.fieldError}>{fieldErrors.name}</Text>
                    )}
                  </View>
                )}
                <View>
                  <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>
                    EMAIL
                  </Text>
                  <TextInput
                    style={[
                      styles.field,
                      fieldStyle,
                      fieldInvalid('email') && styles.fieldErrorBorder,
                    ]}
                    placeholder="you@example.com"
                    placeholderTextColor={theme.dim}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                    accessibilityLabel="Email address"
                  />
                  {fieldInvalid('email') && (
                    <Text style={styles.fieldError}>{fieldErrors.email}</Text>
                  )}
                </View>
                {mode !== 'forgot' && (
                  <View>
                    <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>
                      PASSWORD
                    </Text>
                    <TextInput
                      style={[
                        styles.field,
                        fieldStyle,
                        fieldInvalid('password') && styles.fieldErrorBorder,
                      ]}
                      placeholder="••••••••"
                      placeholderTextColor={theme.dim}
                      secureTextEntry
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      value={password}
                      onChangeText={setPassword}
                      accessibilityLabel="Password"
                    />
                    {fieldInvalid('password') && (
                      <Text style={styles.fieldError}>{fieldErrors.password}</Text>
                    )}
                    {mode === 'signup' && password.length > 0 && (
                      <View style={styles.strengthRow}>
                        {[1, 2, 3].map(seg => (
                          <View
                            key={seg}
                            style={[
                              styles.strengthSeg,
                              {
                                backgroundColor:
                                  seg <= strength ? STRENGTH_COLORS[strength] : theme.track,
                              },
                            ]}
                          />
                        ))}
                        <Text
                          style={[
                            styles.strengthLabel,
                            { color: STRENGTH_COLORS[strength], fontFamily: fonts.body },
                          ]}>
                          {STRENGTH_LABELS[strength]}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
                {mode === 'signup' && (
                  <View>
                    <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>
                      CONFIRM PASSWORD
                    </Text>
                    <TextInput
                      style={[
                        styles.field,
                        fieldStyle,
                        fieldInvalid('confirm') && styles.fieldErrorBorder,
                      ]}
                      placeholder="••••••••"
                      placeholderTextColor={theme.dim}
                      secureTextEntry
                      autoComplete="new-password"
                      value={confirm}
                      onChangeText={setConfirm}
                      accessibilityLabel="Confirm password"
                    />
                    {fieldInvalid('confirm') && (
                      <Text style={styles.fieldError}>{fieldErrors.confirm}</Text>
                    )}
                  </View>
                )}
                {mode === 'signup' && (
                  <Pressable
                    onPress={() => setAcceptedTerms(v => !v)}
                    style={styles.termsRow}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: acceptedTerms }}
                    accessibilityLabel="Accept Privacy Policy and Terms">
                    <View
                      testID="terms-checkbox"
                      style={[
                        styles.termsCheckbox,
                        acceptedTerms && styles.termsCheckboxOn,
                      ]}>
                      {acceptedTerms && <CheckIcon size={12} color="#4ade80" />}
                    </View>
                    <Text style={[styles.termsText, { color: theme.muted, fontFamily: fonts.body }]}>
                      I agree to the{' '}
                      <Text
                        style={{ color: theme.accent }}
                        onPress={() => setShowTerms(true)}>
                        Privacy Policy &amp; Terms
                      </Text>
                    </Text>
                  </Pressable>
                )}
                {mode === 'login' && (
                  <Pressable onPress={() => switchMode('forgot')} style={{ alignSelf: 'flex-end' }}>
                    <Text style={[styles.forgot, { color: theme.dim, fontFamily: fonts.body }]}>
                      Forgot password?
                    </Text>
                  </Pressable>
                )}
                {error && (
                  <Text style={[styles.error, { fontFamily: fonts.body }]}>{error}</Text>
                )}
                <GhostButton
                  label={
                    submitting
                      ? 'PLEASE WAIT…'
                      : mode === 'login'
                        ? 'ENTER SYSTEM'
                        : mode === 'signup'
                          ? 'BEGIN JOURNEY'
                          : 'SEND RECOVERY LINK'
                  }
                  onPress={handleSubmit}
                  disabled={submitting}
                  style={{ marginTop: 4 }}
                />
              </View>
            )}
          </GlassView>

          {!notice && (
            <View style={styles.switchRow}>
              <Text style={[styles.switchText, { color: theme.dim, fontFamily: fonts.body }]}>
                {mode === 'login' ? 'New adventurer?' : mode === 'signup' ? 'Already enrolled?' : ''}
              </Text>
              {mode !== 'forgot' && (
                <Pressable
                  onPress={() => {
                    switchMode(mode === 'login' ? 'signup' : 'login');
                  }}>
                  <Text style={[styles.switchLink, { color: theme.accent, fontFamily: fonts.body }]}>
                    {mode === 'login' ? 'Register' : 'Sign in'}
                  </Text>
                </Pressable>
              )}
              {mode === 'forgot' && (
                <Pressable onPress={resetToLogin}>
                  <Text style={[styles.switchLink, { color: theme.accent, fontFamily: fonts.body }]}>
                    Back to login
                  </Text>
                </Pressable>
              )}
            </View>
          )}

        <Modal
          visible={showTerms}
          transparent
          animationType="fade"
          onRequestClose={() => setShowTerms(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.modal, borderColor: theme.glassBorder }]}>
              <Text style={[styles.modalTitle, { color: theme.text, fontFamily: fonts.display }]}>
                PRIVACY &amp; TERMS
              </Text>
              <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
                <Text style={[styles.modalSectionTitle, { color: theme.muted, fontFamily: fonts.display }]}>
                  DATA WE COLLECT
                </Text>
                <Text style={[styles.modalBody, { color: theme.muted, fontFamily: fonts.body }]}>
                  Your account email, display name, and the quests and completion history you
                  create. Nothing else.
                </Text>
                <Text style={[styles.modalSectionTitle, { color: theme.muted, fontFamily: fonts.display }]}>
                  HOW IT&apos;S USED
                </Text>
                <Text style={[styles.modalBody, { color: theme.muted, fontFamily: fonts.body }]}>
                  Only to run your account and sync your progress across your devices. No ads, no
                  data selling, no third-party trackers. Your password is stored encrypted by our
                  auth provider and never visible to us.
                </Text>
                <Text style={[styles.modalSectionTitle, { color: theme.muted, fontFamily: fonts.display }]}>
                  AI FEATURES
                </Text>
                <Text style={[styles.modalBody, { color: theme.muted, fontFamily: fonts.body }]}>
                  Quest names you submit for suggestions are processed by Google&apos;s Gemini API
                  solely to generate those suggestions. Suggestions are always optional and never
                  auto-saved.
                </Text>
                <Text style={[styles.modalSectionTitle, { color: theme.muted, fontFamily: fonts.display }]}>
                  YOUR CONTROL
                </Text>
                <Text style={[styles.modalBody, { color: theme.muted, fontFamily: fonts.body }]}>
                  You can export your data as JSON or delete your account at any time from
                  Settings.
                </Text>
                <Text style={[styles.modalSectionTitle, { color: theme.muted, fontFamily: fonts.display }]}>
                  TERMS OF USE
                </Text>
                <Text style={[styles.modalBody, { color: theme.muted, fontFamily: fonts.body }]}>
                  Eiyu System is provided as-is, without warranty. One account per person, keep
                  content respectful. Your quest data remains yours.
                </Text>
              </ScrollView>
              <GhostButton label="GOT IT" onPress={() => setShowTerms(false)} />
            </View>
          </View>
        </Modal>
        </Screen>
      </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 32,
    width: '100%',
    maxWidth: 360,
  },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoGlyph: {
    fontSize: 22,
  },
  title: {
    fontSize: 28,
    letterSpacing: 3,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
  },
  label: {
    fontSize: 12,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  field: {
    borderWidth: 1,
    borderRadius: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  forgot: {
    fontSize: 12,
  },
  error: {
    fontSize: 12,
    color: '#f87171',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 20,
  },
  switchText: {
    fontSize: 13,
  },
  switchLink: {
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  recoveryDone: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 4,
  },
  recoveryEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  recoveryTitle: {
    fontSize: 18,
    marginBottom: 2,
  },
  recoverySub: {
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
  },
  fieldError: {
    fontSize: 12,
    color: '#f87171',
    marginTop: 5,
  },
  fieldErrorBorder: {
    borderColor: '#f87171',
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  strengthSeg: {
    height: 4,
    width: 32,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 11,
    marginLeft: 4,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 2,
  },
  termsCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(120,140,160,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  termsCheckboxOn: {
    backgroundColor: 'rgba(74,222,128,0.15)',
    borderColor: 'rgba(74,222,128,0.5)',
  },
  termsText: {
    fontSize: 13,
    flexShrink: 1,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    letterSpacing: 1.5,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalSectionTitle: {
    fontSize: 11,
    letterSpacing: 1.2,
    marginTop: 10,
    marginBottom: 3,
  },
  modalBody: {
    fontSize: 13,
    lineHeight: 19,
  },
});
