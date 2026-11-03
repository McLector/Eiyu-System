import 'react-native-url-polyfill/auto';
import * as Linking from 'expo-linking';
import {redirectRecoveryLink} from '@/lib/recovery-link';

export function redirectSystemPath({path}: {path: string; initial: boolean}) {
 try {return redirectRecoveryLink(path, Linking.createURL('auth/recovery'));}
 catch {return '/auth/recovery';}
}
