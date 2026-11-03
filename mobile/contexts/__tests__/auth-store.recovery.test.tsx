import {Pressable, Text} from 'react-native';
import {render, screen, userEvent, waitFor} from '@testing-library/react-native';
import {AuthProvider, useAuth} from '../auth-store';
const mockReset = jest.fn();
jest.mock('@/lib/supabase', () => ({supabase: {auth: {
 getSession: async () => ({data: {session: null}}),
 onAuthStateChange: () => ({data: {subscription: {unsubscribe: jest.fn()}}}),
 resetPasswordForEmail: (...args: unknown[]) => mockReset(...args),
}}}));
jest.mock('expo-linking', () => ({createURL: (path: string) => `eiyusystem-dev://${path}`}));
function Probe() {const {resetPassword} = useAuth(); return <Pressable accessibilityRole="button" onPress={() => void resetPassword('hero@example.invalid')}><Text>Request recovery</Text></Pressable>;}
it('requests a callback for the current installed app variant', async () => {
 mockReset.mockResolvedValue({error: null});
 const user = userEvent.setup(); await render(<AuthProvider><Probe/></AuthProvider>);
 await user.press(screen.getByRole('button', {name: 'Request recovery'}));
 await waitFor(() => expect(mockReset).toHaveBeenCalledWith('hero@example.invalid', {redirectTo: 'eiyusystem-dev://auth/recovery'}));
});
