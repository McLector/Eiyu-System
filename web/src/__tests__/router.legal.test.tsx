// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: null as { user: { id: string } } | null, loading: false }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: {} }, createRecoveryAuth: () => ({}) }));
vi.mock('../store/session-context', () => ({
  useSession: () => ({ session: mocks.session, user: mocks.session?.user ?? null, loading: mocks.loading, signOut: vi.fn() }),
}));
vi.mock('../web/PostSignInRedirect', () => ({ default: () => <p>SIGNED-IN REDIRECT</p> }));
vi.mock('../pages/BoardPage', () => ({ default: () => <p>BOARD</p> }));
import { routes } from '../router';

afterEach(cleanup);
beforeEach(() => { mocks.session = null; mocks.loading = false; });

function visit(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe.each([['/privacy', 'Privacy Policy'], ['/terms', 'Terms of Use']])('%s', (path, title) => {
  it('is open to someone who is not signed in', async () => {
    const router = visit(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
  });

  it('stays put for a signed-in person instead of sending them to the app', async () => {
    mocks.session = { user: { id: 'owner' } };
    const router = visit(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
    expect(screen.queryByText('SIGNED-IN REDIRECT')).not.toBeInTheDocument();
  });

  it('shows the page while the session is still loading', async () => {
    mocks.loading = true;
    visit(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });
});

it('still sends unknown paths home', () => {
  const router = visit('/privacy-policy');
  expect(router.state.location.pathname).toBe('/');
});
