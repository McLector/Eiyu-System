// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn(), listener: undefined as ((event: AuthChangeEvent, session: Session | null) => void) | undefined }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));
import { SessionProvider, useSession } from '../session-context';
import AuthPage from '../../pages/AuthPage';
const session = { user: { id: 'owner' } } as Session;
function Workspace() {
  const state = useSession();
  return state.session ? <button onClick={() => void state.signOut()}>Sign out fixture</button> : state.loading ? null : <AuthPage />;
}
function setup() {
  const router = createMemoryRouter([{ path: '/', element: <Workspace /> }]);
  render(<SessionProvider><RouterProvider router={router} /></SessionProvider>);
}
beforeEach(() => {
  auth.getSession.mockReset().mockResolvedValue({ data: { session } });
  auth.onAuthStateChange.mockReset().mockImplementation(listener => { auth.listener = listener; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
  auth.signOut.mockReset().mockImplementation(async () => { auth.listener?.('SIGNED_OUT', null); return { error: new Error('Server unavailable') }; });
});
afterEach(cleanup);

it('keeps a sign-out failure visible after the auth client removes its local session', async () => {
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Sign out fixture' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Signed out on this device. Server sign-out could not be confirmed: Server unavailable');
  expect(screen.getByRole('textbox', { name: 'Email address' })).toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'hero@example.invalid');
  await user.click(screen.getByRole('button', { name: 'Dismiss sign-out warning' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveValue('hero@example.invalid');
});

it('discards the old sign-out warning when another account signs in', async () => {
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Sign out fixture' }));
  await screen.findByRole('alert');
  await act(async () => auth.listener?.('SIGNED_IN', { user: { id: 'other' } } as Session));
  auth.signOut.mockImplementationOnce(async () => { auth.listener?.('SIGNED_OUT', null); return { error: null }; });
  await user.click(screen.getByRole('button', { name: 'Sign out fixture' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Email address' })).toBeInTheDocument();
});

it('ignores a late sign-out error belonging to the previous account', async () => {
  let resolve!: (value: { error: Error }) => void;
  auth.signOut.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole('button', { name: 'Sign out fixture' }));
  await act(async () => auth.listener?.('SIGNED_IN', { user: { id: 'other' } } as Session));
  await act(async () => resolve({ error: new Error('Old account failure') }));
  await act(async () => auth.listener?.('SIGNED_OUT', null));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
