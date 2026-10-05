import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  Rajdhani_500Medium,
  Rajdhani_600SemiBold,
  Rajdhani_700Bold,
} from '@expo-google-fonts/rajdhani';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/auth-store';
import { EiyuProvider, persister, queryClient } from '@/contexts/eiyu-store';
import { AppThemeProvider } from '@/contexts/theme-store';
import { DevBall } from '@/components/eiyu/dev-ball';
import { ThemedShell } from '@/components/eiyu/themed-shell';
import { installAppFocus } from '@/lib/app-focus';
import { useNotificationTaps } from '@/lib/notification-taps';

SplashScreen.preventAutoHideAsync();
installAppFocus();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Rajdhani_500Medium,
    Rajdhani_600SemiBold,
    Rajdhani_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });

  if (!fontsLoaded) return null;

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        // A week of local-first reads; stale data still revalidates on mount.
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }}>
      <AuthProvider>
        <AppThemeProvider>
          <EiyuProvider>
            <ThemedShell>
              {/* Improvement-pass #1: app-wide keyboard handling (Android edge-to-edge
                  makes classic adjustResize unreliable). */}
              <KeyboardProvider>
                <AppNavigator />
                {/* Improvement-pass #10: __DEV__-only testing ball; renders null in production. */}
                <DevBall />
              </KeyboardProvider>
            </ThemedShell>
          </EiyuProvider>
        </AppThemeProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}

function AppNavigator() {
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);
  useNotificationTaps(!loading && !!session);

  if (loading) return null;

  return (
    <Stack>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="auth" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="quest-editor"
          options={{ presentation: 'card', headerShown: false, animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="history"
          options={{ presentation: 'transparentModal', headerShown: false, animation: 'none' }}
        />
        <Stack.Screen
          name="long-quest-editor"
          options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }}
        />
      </Stack.Protected>
    </Stack>
  );
}
