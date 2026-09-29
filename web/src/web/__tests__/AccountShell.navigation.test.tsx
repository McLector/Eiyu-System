// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ saveProfile: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: () => ({
  user: { name: 'Yuki Tanaka', userClass: 'Ranger', rank: 'C' }, saveProfile: store.saveProfile,
}) }));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ signOut: vi.fn() }) }));
vi.mock('../WebSettings', () => ({ default: ({ onShowHistory }: { onShowHistory: () => void }) =>
  <button onClick={onShowHistory}>VIEW HISTORY</button> }));
import ProtectedLayout from '../../ProtectedLayout';
import SettingsPage from '../../pages/SettingsPage';

function setup(initial = '/board') {
  const router = createMemoryRouter([{ path: '/', element: <ProtectedLayout />, children: [
    { path: '/board', element: <p>BOARD CONTENT</p> },
    { path: '/history', element: <p>HISTORY CONTENT</p> },
    { path: '/settings', element: <SettingsPage /> },
  ] }], { initialEntries: [initial] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => store.saveProfile.mockReset().mockResolvedValue(undefined));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('isolates the profile dialog, traps focus, and returns to its account trigger', async () => {
  const user = userEvent.setup();
  setup();
  const trigger = screen.getByRole('button', { name: /Yuki Tanaka.*Ranger.*rank C/i });
  await user.click(trigger);
  await user.click(screen.getByRole('menuitem', { name: 'Edit details' }));
  const dialog = screen.getByRole('dialog', { name: 'EDIT DETAILS' });
  expect(dialog).toBeInTheDocument();
  expect((document.body.firstElementChild as HTMLElement).inert).toBe(true);
  expect((document.body.firstElementChild as HTMLElement)).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getByRole('button', { name: 'Close EDIT DETAILS' })).toHaveFocus();
  await user.keyboard('{Shift>}{Tab}{/Shift}');
  expect(screen.getByRole('button', { name: 'SAVE' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('blocks browser Back while dirty, permits discard, and Forward reopens the overlay', async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  const router = setup();
  await user.click(screen.getByRole('button', { name: /Yuki Tanaka.*rank C/i }));
  await user.click(screen.getByRole('menuitem', { name: 'Edit details' }));
  await user.clear(screen.getByRole('textbox', { name: 'Display name' }));
  await user.type(screen.getByRole('textbox', { name: 'Display name' }), 'Unsaved');
  await router.navigate(-1);
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole('dialog', { name: 'EDIT DETAILS' })).toBeInTheDocument();
  expect(router.state.location.search).toBe('?account=profile');
  await router.navigate(-1);
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(router.state.location.search).toBe(''));
  await waitFor(() => expect(router.state.blockers.size).toBe(0));
  await router.navigate(1);
  expect(await screen.findByRole('dialog', { name: 'EDIT DETAILS' })).toBeInTheDocument();
});

it('keeps pending saves open and shows late failures in the dialog', async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  let reject!: (error: Error) => void;
  store.saveProfile.mockImplementationOnce(() => new Promise<void>((_resolve, r) => { reject = r; }));
  const router = setup();
  await user.click(screen.getByRole('button', { name: /Yuki Tanaka.*rank C/i }));
  await user.click(screen.getByRole('menuitem', { name: 'Edit details' }));
  await user.type(screen.getByRole('textbox', { name: 'Display name' }), ' X');
  await user.click(screen.getByRole('button', { name: 'SAVE' }));
  expect(screen.getByRole('button', { name: 'SAVING…' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Display name' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Class' })).toBeDisabled();
  expect(store.saveProfile).toHaveBeenCalledTimes(1);
  await router.navigate(-1);
  expect(screen.getByRole('dialog', { name: 'EDIT DETAILS' })).toBeInTheDocument();
  reject(new Error('server unavailable'));
  expect(await screen.findByRole('alert')).toHaveTextContent('server unavailable');
  expect(screen.getByRole('dialog', { name: 'EDIT DETAILS' })).toBeInTheDocument();
  expect(confirm).not.toHaveBeenCalled();
});

it('navigates Settings to History', async () => {
  const user = userEvent.setup();
  const router = setup();
  await user.click(screen.getByRole('button', { name: /Yuki Tanaka.*rank C/i }));
  await user.click(screen.getByRole('menuitem', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: 'VIEW HISTORY' }));
  expect(await screen.findByText('HISTORY CONTENT')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/history');
});

it('canonicalizes the legacy Settings route into the same closable overlay', async () => {
  const user = userEvent.setup();
  const router = setup('/settings');
  expect(await screen.findByRole('dialog', { name: 'SETTINGS' })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/board');
  expect(router.state.location.search).toBe('?account=settings');
  await user.click(screen.getByRole('button', { name: 'Close SETTINGS' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/board');
  expect(router.state.location.search).toBe('');
});
