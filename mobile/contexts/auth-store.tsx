import type { AuthError, Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GOOGLE_GENERIC_MESSAGE, deviceTimeZone, formatError, initialBirthdayMetadata } from '@eiyu/shared';

import { googleRedirectUrl, runGoogleSignIn } from '@/lib/google-oauth';
import { getGoogleOAuthClient, supabase } from '@/lib/supabase';

interface AuthResult {
  error: string | null;
  /** true when signup succeeded but the account still needs email confirmation */
  needsEmailConfirmation?: boolean;
}

interface AuthStore {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, displayName: string, birthday: string, ageConsent: boolean) => Promise<AuthResult>;
  signOut: () => Promise<{ error: AuthError | null }>;
  resetPassword: (email: string) => Promise<AuthResult>;
  /** Opens Google in an in-app browser. `cancelled` means the user backed out: signed out, nothing to show. */
  signInWithGoogle: () => Promise<{ error: string | null; cancelled: boolean }>;
  /**
   * The message the last Google flow ended with, or null. It lives here, not in a screen, because the callback link is
   * routed to `/` and can put a second sign-in screen on top of the one that started the flow.
   */
  googleMessage: string | null;
  clearGoogleMessage: () => void;
}

const AuthContext = createContext<AuthStore | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const googleRunning = useRef(false);
  const [googleMessage, setGoogleMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthStore>(
    () => ({
      session,
      loading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      signUp: async (email, password, displayName, birthday, ageConsent) => {
        let birthdayMetadata: ReturnType<typeof initialBirthdayMetadata>;
        try {birthdayMetadata = initialBirthdayMetadata(birthday, ageConsent);}
        catch (err) {return {error: formatError(err)};}
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName, time_zone: deviceTimeZone(), ...birthdayMetadata } },
        });
        if (error) return { error: error.message };
        return { error: null, needsEmailConfirmation: !data.session };
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        return { error };
      },
      resetPassword: async email => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: Linking.createURL('auth/recovery'),
        });
        return { error: error?.message ?? null };
      },
      signInWithGoogle: async () => {
        // The browser can stay open for a while; a second tap must not start a second flow.
        if (googleRunning.current) return { error: null, cancelled: true };
        googleRunning.current = true;
        setGoogleMessage(null);
        try {
          const result = await runGoogleSignIn({
            oauth: getGoogleOAuthClient(),
            main: supabase.auth,
            openAuthSession: (url, redirectUrl) => WebBrowser.openAuthSessionAsync(url, redirectUrl),
            redirectTo: googleRedirectUrl(),
          });
          if (result.error) setGoogleMessage(result.error);
          return result;
        } catch {
          setGoogleMessage(GOOGLE_GENERIC_MESSAGE);
          return { error: GOOGLE_GENERIC_MESSAGE, cancelled: false };
        } finally {
          googleRunning.current = false;
        }
      },
      googleMessage,
      clearGoogleMessage: () => setGoogleMessage(null),
    }),
    [session, loading, googleMessage]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
