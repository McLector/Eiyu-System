// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ status: vi.fn(), session: { user: { id: 'owner-a' } } as { user: { id: string } } | null }));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<typeof import('@eiyu/shared')>(),
  fetchOperatorStatus: (...args: unknown[]) => mocks.status(...args),
}));
vi.mock('../../store/session-context', () => ({
  useSession: () => ({ session: mocks.session, user: mocks.session?.user ?? null, loading: false, signOut: vi.fn() }),
}));
vi.mock('../AdminConsole', () => ({ default: () => <p>CONSOLE</p> }));
vi.mock('../AdminMfa', () => ({ default: () => <p>MFA STEP</p> }));
import PostSignInRedirect from '../PostSignInRedirect';
import AdminPage from '../../pages/AdminPage';

afterEach(cleanup);
beforeEach(() => { mocks.status.mockReset(); mocks.session = { user: { id: 'owner-a' } }; });

const op = (over: object = {}) => ({ isOperator: true, mfaRequired: true, aal: 'aal2', ...over });
function signIn() {
  const router = createMemoryRouter([
    { path: '/', element: <PostSignInRedirect /> },
    { path: '/board', element: <p>BOARD</p> },
    { path: '/admin', element: <p>ADMIN ROUTE</p> },
  ], { initialEntries: ['/'] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('after sign-in', () => {
  it('sends an operator at aal2 to /admin', async () => {
    mocks.status.mockResolvedValue(op());
    signIn();
    expect(await screen.findByText('ADMIN ROUTE')).toBeInTheDocument();
    expect(mocks.status).toHaveBeenCalledWith('owner-a');
  });
  it('sends an operator at aal1 to /admin, where the MFA step lives', async () => {
    mocks.status.mockResolvedValue(op({ aal: 'aal1' }));
    signIn();
    expect(await screen.findByText('ADMIN ROUTE')).toBeInTheDocument();
  });
  it('leaves a non-operator on the Board', async () => {
    mocks.status.mockResolvedValue({ isOperator: false, mfaRequired: false, aal: 'aal1' });
    signIn();
    expect(await screen.findByText('BOARD')).toBeInTheDocument();
  });
  it('falls back to the Board when the status cannot be read', async () => {
    mocks.status.mockRejectedValue(new Error('x'));
    signIn();
    expect(await screen.findByText('BOARD')).toBeInTheDocument();
  });
  it('renders nothing while the status is loading', () => {
    mocks.status.mockReturnValue(new Promise(() => undefined));
    const router = signIn();
    expect(screen.queryByText('BOARD')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
  it('does not ask the server when there is no session', async () => {
    mocks.session = null;
    signIn();
    await waitFor(() => expect(screen.getByText('BOARD')).toBeInTheDocument());
    expect(mocks.status).not.toHaveBeenCalled();
  });
});

describe('/admin', () => {
  function visit() {
    const router = createMemoryRouter([
      { path: '/admin', element: <AdminPage /> }, { path: '/board', element: <p>BOARD</p> },
    ], { initialEntries: ['/admin'] });
    render(<RouterProvider router={router} />);
  }
  it('shows the console to an operator at aal2', async () => {
    mocks.status.mockResolvedValue(op());
    visit();
    expect(await screen.findByText('CONSOLE')).toBeInTheDocument();
  });
  it('shows the MFA step, and nothing else, to an operator at aal1', async () => {
    mocks.status.mockResolvedValue(op({ aal: 'aal1' }));
    visit();
    expect(await screen.findByText('MFA STEP')).toBeInTheDocument();
    expect(screen.queryByText('CONSOLE')).not.toBeInTheDocument();
  });
  it('shows a non-operator nothing privileged and returns them to the Board', async () => {
    mocks.status.mockResolvedValue({ isOperator: false, mfaRequired: false, aal: 'aal1' });
    visit();
    expect(await screen.findByText('BOARD')).toBeInTheDocument();
    expect(screen.queryByText('CONSOLE')).not.toBeInTheDocument();
    expect(screen.queryByText('MFA STEP')).not.toBeInTheDocument();
  });
  it('treats a failed status read as not an operator', async () => {
    mocks.status.mockRejectedValue(new Error('x'));
    visit();
    expect(await screen.findByText('BOARD')).toBeInTheDocument();
    expect(screen.queryByText('CONSOLE')).not.toBeInTheDocument();
  });
  it('shows nothing while loading', () => {
    mocks.status.mockReturnValue(new Promise(() => undefined));
    visit();
    expect(screen.queryByText('CONSOLE')).not.toBeInTheDocument();
    expect(screen.queryByText('BOARD')).not.toBeInTheDocument();
  });
});
