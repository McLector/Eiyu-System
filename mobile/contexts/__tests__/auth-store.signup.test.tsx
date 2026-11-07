import {Pressable, Text} from 'react-native';
import {fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import {AuthProvider, useAuth} from '../auth-store';
const mockSignup = jest.fn();
jest.mock('@/lib/supabase', () => ({supabase: {auth: {
  getSession: async () => ({data: {session: null}}),
  onAuthStateChange: () => ({data: {subscription: {unsubscribe: jest.fn()}}}),
  signUp: (...args: unknown[]) => mockSignup(...args),
}}}));
jest.mock('expo-linking', () => ({createURL: (path: string) => `eiyusystem-dev://${path}`}));
let lastResult: unknown;
function Probe() {
  const {signUp} = useAuth();
  return <Pressable accessibilityRole="button" onPress={() => void signUp('hero@example.invalid', 'SyntheticPass1!', 'Hero').then(r => {lastResult = r;})}><Text>Signup</Text></Pressable>;
}
beforeEach(() => {lastResult = undefined; mockSignup.mockReset().mockResolvedValue({data: {session: null}, error: null});});
it('sends the Terms version with the name and time zone, and nothing about age or AI', async () => {
  await render(<AuthProvider><Probe/></AuthProvider>);
  await fireEvent.press(screen.getByRole('button', {name: 'Signup'}));
  await waitFor(() => expect(mockSignup).toHaveBeenCalledTimes(1));
  expect(mockSignup).toHaveBeenCalledWith({email: 'hero@example.invalid', password: 'SyntheticPass1!', options: {data: {
    display_name: 'Hero', time_zone: expect.any(String), terms: {version: '2026-11-08-terms-v2'},
  }}});
  const data = mockSignup.mock.calls[0][0].options.data;
  expect(data.birth_date).toBeUndefined(); expect(data.processing_consent).toBeUndefined();
});
it('asks for email confirmation when no session comes back', async () => {
  await render(<AuthProvider><Probe/></AuthProvider>);
  await fireEvent.press(screen.getByRole('button', {name: 'Signup'}));
  await waitFor(() => expect(lastResult).toEqual({error: null, needsEmailConfirmation: true}));
});
it('passes an Auth error through and still sends the same metadata', async () => {
  mockSignup.mockResolvedValue({data: {session: null}, error: {message: 'User already registered'}});
  await render(<AuthProvider><Probe/></AuthProvider>);
  await fireEvent.press(screen.getByRole('button', {name: 'Signup'}));
  await waitFor(() => expect(lastResult).toEqual({error: 'User already registered'}));
});
