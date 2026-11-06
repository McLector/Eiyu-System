// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GOOGLE_CANCELLED_MESSAGE, GOOGLE_EXPIRED_MESSAGE } from '@eiyu/shared';

const state = vi.hoisted(() => ({ session: null as null | { user: { id: string } }, loading: false }));

vi.mock('../../store/session-context', () => ({
  useSession: () => ({ session: state.session, loading: state.loading, signOutError: null, clearSignOutError: () => {} }),
}));
vi.mock('../../web/WebAuth', () => ({
  default: ({ googleMessage }: { googleMessage?: { text: string; cancelled: boolean } | null }) => (
    <p data-testid="auth">{googleMessage ? `${googleMessage.text}|cancelled=${googleMessage.cancelled}` : 'no message'}</p>
  ),
}));
vi.mock('../../web/PostSignInRedirect', () => ({ default: ({ fallback }: { fallback: string }) => <p>redirect {fallback}</p> }));

import AuthPage from '../AuthPage';

// The exact redirect GoTrue sent to the site URL when the account chooser sat open too long (2026-11-07).
const EXPIRED = '/auth?error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+has+expired';

function Probe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>;
}

function setup(entry: string | { pathname: string; state: unknown }) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[entry]}>
        <Probe />
        <Routes><Route path="/auth" element={<AuthPage />} /></Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => { state.session = null; state.loading = false; });
afterEach(cleanup);

it('tells the person an expired Google sign-in took too long and clears the address bar', async () => {
  setup(EXPIRED);
  expect(await screen.findByText(`${GOOGLE_EXPIRED_MESSAGE}|cancelled=false`)).toBeInTheDocument();
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/auth$/);
});

it('finds the expired shape in the hash as well', async () => {
  setup('/auth#error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+has+expired');
  expect(await screen.findByText(`${GOOGLE_EXPIRED_MESSAGE}|cancelled=false`)).toBeInTheDocument();
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/auth$/);
});

it('leaves other errors on the sign-in page alone, such as an expired email link', () => {
  const otp = '/auth#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
  setup(otp);
  expect(screen.getByTestId('auth')).toHaveTextContent('no message');
  expect(screen.getByTestId('location')).toHaveTextContent('otp_expired');
});

it('shows no message on a plain visit', () => {
  setup('/auth');
  expect(screen.getByTestId('auth')).toHaveTextContent('no message');
});

it('still passes on a message from the callback page', () => {
  setup({ pathname: '/auth', state: { googleMessage: { text: GOOGLE_CANCELLED_MESSAGE, cancelled: true } } });
  expect(screen.getByTestId('auth')).toHaveTextContent(`${GOOGLE_CANCELLED_MESSAGE}|cancelled=true`);
});

it('does not hold a signed-in person on the sign-in page because of a stale expired link', () => {
  state.session = { user: { id: 'u1' } };
  setup(EXPIRED);
  expect(screen.getByText('redirect /board')).toBeInTheDocument();
});
