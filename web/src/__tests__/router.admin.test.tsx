// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: null as { user: { id: string } } | null }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: {} }, createRecoveryAuth: () => ({}) }));
vi.mock('../store/session-context', () => ({
  useSession: () => ({ session: mocks.session, user: mocks.session?.user ?? null, loading: false, signOut: vi.fn() }),
}));
vi.mock('../RootPage', () => ({ default: () => <p>HOME</p> }));
import { routes } from '../router';

afterEach(cleanup);
beforeEach(() => { mocks.session = null; });

function visit(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('/admin is gone', () => {
  it('is not a route any more', () => {
    expect(JSON.stringify(routes.map(function walk(route): unknown { return [route.path, route.children?.map(walk)]; }))).not.toContain('/admin');
  });
  it('sends a signed-in person to the home route like any unknown path', async () => {
    mocks.session = { user: { id: 'owner-a' } };
    const router = visit('/admin');
    expect(await screen.findByText('HOME')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
  it('sends a signed-out person home too, without a sign-in detour', async () => {
    const router = visit('/admin');
    expect(await screen.findByText('HOME')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});
