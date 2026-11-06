import 'react-native-url-polyfill/auto';
import * as Linking from 'expo-linking';
import {redirectRecoveryLink} from '@/lib/recovery-link';

// The Google round trip returns to `<scheme>://auth/callback?code=...`. `openAuthSessionAsync` hands that URL to
// the waiting sign-in; the router must not also route it, or the one-time code would sit in navigation state.
const GOOGLE_CALLBACK = /^(?:[a-z][a-z0-9+.-]*:\/\/[^/?#]*)?\/?auth\/callback(?:[?#]|$)/i;

export function redirectSystemPath({path}: {path: string; initial: boolean}) {
 if (GOOGLE_CALLBACK.test(path)) return '/';
 try {return redirectRecoveryLink(path, Linking.createURL('auth/recovery'));}
 catch {return '/auth/recovery';}
}
