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
function Probe({birthday, grant}: {birthday: string; grant: boolean}) {
  const {signUp} = useAuth();
  return <Pressable accessibilityRole="button" onPress={() => void signUp('hero@example.invalid', 'SyntheticPass1!', 'Hero', birthday, grant)}><Text>Signup</Text></Pressable>;
}
beforeEach(() => {mockSignup.mockReset().mockResolvedValue({data: {session: null}, error: null});});
it.each([[false, '2000-01-01'], [true, '2020-01-01'], [true, '2023-02-29']] as const)(
  'does not call Auth for grant %s and rejected declaration %s', async (grant, birthday) => {
    await render(<AuthProvider><Probe birthday={birthday} grant={grant}/></AuthProvider>);
    await fireEvent.press(screen.getByRole('button', {name: 'Signup'}));
    expect(mockSignup).not.toHaveBeenCalled();
  });
it('records initial specific age purpose, never AI or authority', async () => {
  await render(<AuthProvider><Probe birthday="2000-01-01" grant/></AuthProvider>);
  await fireEvent.press(screen.getByRole('button', {name: 'Signup'}));
  await waitFor(() => expect(mockSignup).toHaveBeenCalledWith(expect.objectContaining({options: {data: expect.objectContaining({
    birth_date: '2000-01-01', processing_consent: {age_screening: {granted: true, notice_version: '2026-10-20-age-v1'}},
  })}})));
  expect(mockSignup.mock.calls[0][0].options.data.processing_consent.weekly_debrief).toBeUndefined();
});
