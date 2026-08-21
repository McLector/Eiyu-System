import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { GhostButton } from '@/components/eiyu/ghost-button';
import { GlassView } from '@/components/eiyu/glass-view';
import { PageBackground } from '@/components/eiyu/page-background';
import { fonts } from '@/constants/eiyu-theme';
import { useAuth } from '@/contexts/auth-store';
import { useEiyu } from '@/contexts/eiyu-store';

type AuthMode = 'login' | 'signup' | 'forgot';

interface Notice {
  emoji: string;
  title: string;
  message: string;
}

export default function AuthScreen() {
  const { theme } = useEiyu();
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const resetToLogin = () => {
    setMode('login');
    setNotice(null);
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);

    if (mode === 'signup' && name.trim().length === 0) {
      setError('Enter a display name.');
      return;
    }
    if (email.trim().length === 0) {
      setError('Enter your email.');
      return;
    }
    if (mode !== 'forgot' && password.length < 6) {
      setError('Password must be at least 6 characters.');
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
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
                      style={[styles.field, fieldStyle]}
                      placeholder="Kaito Mizuru"
                      placeholderTextColor={theme.dim}
                      value={name}
                      onChangeText={setName}
                    />
                  </View>
                )}
                <View>
                  <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>
                    EMAIL
                  </Text>
                  <TextInput
                    style={[styles.field, fieldStyle]}
                    placeholder="you@example.com"
                    placeholderTextColor={theme.dim}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>
                {mode !== 'forgot' && (
                  <View>
                    <Text style={[styles.label, { color: theme.muted, fontFamily: fonts.display }]}>
                      PASSWORD
                    </Text>
                    <TextInput
                      style={[styles.field, fieldStyle]}
                      placeholder="••••••••"
                      placeholderTextColor={theme.dim}
                      secureTextEntry
                      value={password}
                      onChangeText={setPassword}
                    />
                  </View>
                )}
                {mode === 'login' && (
                  <Pressable onPress={() => setMode('forgot')} style={{ alignSelf: 'flex-end' }}>
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
                    setMode(mode === 'login' ? 'signup' : 'login');
                    setError(null);
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
        </ScrollView>
      </KeyboardAvoidingView>
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
});
