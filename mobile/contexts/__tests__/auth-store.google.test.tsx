import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AuthProvider, useAuth } from '../auth-store';

const mockRun = jest.fn();
const mockOpen = jest.fn();
const mockOauth = { signInWithOAuth: jest.fn(), exchangeCodeForSession: jest.fn() };
const mockAuth = {
  getSession: async () => ({ data: { session: null } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
};

jest.mock('@/lib/supabase', () => ({
  // Lazy: the mock constants below are not initialised yet when the store is first imported.
  supabase: { get auth() { return mockAuth; } },
  getGoogleOAuthClient: () => mockOauth,
}));
jest.mock('@/lib/google-oauth', () => ({
  googleRedirectUrl: () => 'eiyusystem-dev://auth/callback',
  runGoogleSignIn: (...args: unknown[]) => mockRun(...args),
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: (...args: unknown[]) => mockOpen(...args) }));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `eiyusystem-dev://${path}` }));

let last: unknown;
function Probe() {
  const { signInWithGoogle } = useAuth();
  return (
    <Pressable accessibilityRole="button" onPress={() => { last = signInWithGoogle(); }}>
      <Text>Google</Text>
    </Pressable>
  );
}

beforeEach(() => {
  mockRun.mockReset().mockResolvedValue({ error: null, cancelled: false });
  mockOpen.mockReset();
  last = undefined;
});

it('runs the flow with the app clients, the browser and the variant redirect', async () => {
  await render(<AuthProvider><Probe /></AuthProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Google' }));
  await waitFor(() => expect(mockRun).toHaveBeenCalledTimes(1));
  const arg = mockRun.mock.calls[0][0];
  expect(arg.oauth).toBe(mockOauth);
  expect(arg.main).toBe(mockAuth);
  expect(arg.redirectTo).toBe('eiyusystem-dev://auth/callback');
  await arg.openAuthSession('https://accounts.example/start', 'eiyusystem-dev://auth/callback');
  expect(mockOpen).toHaveBeenCalledWith('https://accounts.example/start', 'eiyusystem-dev://auth/callback');
  await expect(last).resolves.toEqual({ error: null, cancelled: false });
});

it('returns the flow result, including a message', async () => {
  mockRun.mockResolvedValue({ error: 'Google sign-in did not work.', cancelled: false });
  await render(<AuthProvider><Probe /></AuthProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Google' }));
  await expect(last).resolves.toEqual({ error: 'Google sign-in did not work.', cancelled: false });
});

it('ignores a second press while the first is still running', async () => {
  let release: (value: unknown) => void = () => {};
  mockRun.mockReturnValue(new Promise(resolve => { release = resolve; }));
  await render(<AuthProvider><Probe /></AuthProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Google' }));
  const second = (async () => { await fireEvent.press(screen.getByRole('button', { name: 'Google' })); return last; })();
  await second;
  expect(mockRun).toHaveBeenCalledTimes(1);
  await act(async () => { release({ error: null, cancelled: true }); });
  await fireEvent.press(screen.getByRole('button', { name: 'Google' }));
  expect(mockRun).toHaveBeenCalledTimes(2);
});

it('turns a thrown flow into the generic message instead of rejecting', async () => {
  mockRun.mockRejectedValue(new Error('boom: raw detail'));
  await render(<AuthProvider><Probe /></AuthProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Google' }));
  const result = (await last) as { error: string | null; cancelled: boolean };
  expect(result.cancelled).toBe(false);
  expect(result.error).toMatch(/Google sign-in did not work/);
  expect(result.error).not.toContain('boom');
});

// The callback link is routed to `/`, which can put a second sign-in screen on top of the one that started the flow.
// The message therefore lives in the store, not in a screen's own state.
function Shown({ label }: { label: string }) {
  const { googleMessage } = useAuth();
  return <Text accessibilityLabel={label}>{googleMessage ?? 'none'}</Text>;
}
function Controls() {
  const { signInWithGoogle, clearGoogleMessage } = useAuth();
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => { last = signInWithGoogle(); }}><Text>Start</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={clearGoogleMessage}><Text>Clear</Text></Pressable>
    </>
  );
}

describe('the Google message held in the store', () => {
  it('is null until a flow ends with a message', async () => {
    await render(<AuthProvider><Shown label="first" /></AuthProvider>);
    expect(screen.getByLabelText('first')).toHaveTextContent('none');
  });

  it('is shown to every consumer, including one mounted after the flow started', async () => {
    let release: (value: unknown) => void = () => {};
    mockRun.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const { rerender } = await render(<AuthProvider><Controls /><Shown label="first" /></AuthProvider>);
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    await rerender(<AuthProvider><Controls /><Shown label="first" /><Shown label="second" /></AuthProvider>);
    await act(async () => { release({ error: 'Refused.', cancelled: false }); });
    expect(screen.getByLabelText('first')).toHaveTextContent('Refused.');
    expect(screen.getByLabelText('second')).toHaveTextContent('Refused.');
  });

  it('is cleared when a new flow starts and by clearGoogleMessage', async () => {
    mockRun.mockResolvedValueOnce({ error: 'Refused.', cancelled: false });
    await render(<AuthProvider><Controls /><Shown label="first" /></AuthProvider>);
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByLabelText('first')).toHaveTextContent('Refused.'));
    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('first')).toHaveTextContent('none');

    mockRun.mockResolvedValueOnce({ error: 'Refused.', cancelled: false });
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByLabelText('first')).toHaveTextContent('Refused.'));
    let release: (value: unknown) => void = () => {};
    mockRun.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByLabelText('first')).toHaveTextContent('none');
    await act(async () => { release({ error: null, cancelled: true }); });
  });

  it('stays empty after a cancel', async () => {
    mockRun.mockResolvedValueOnce({ error: null, cancelled: true });
    await render(<AuthProvider><Controls /><Shown label="first" /></AuthProvider>);
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mockRun).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('first')).toHaveTextContent('none');
  });

  it('holds the generic message when the flow throws', async () => {
    mockRun.mockRejectedValueOnce(new Error('boom: raw detail'));
    await render(<AuthProvider><Controls /><Shown label="first" /></AuthProvider>);
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByLabelText('first')).toHaveTextContent(/Google sign-in did not work/));
    expect(screen.getByLabelText('first')).not.toHaveTextContent('boom');
  });
});
