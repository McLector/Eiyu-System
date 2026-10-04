// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ saveProfile: vi.fn(), signOut: vi.fn(), name: 'Yuki Tanaka' }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: () => ({
  user: { name: store.name, userClass: 'Ranger', rank: 'C' }, saveProfile: store.saveProfile,
}) }));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ signOut: store.signOut }) }));
vi.mock('../WebSettings', () => ({ default: ({ onShowHistory }: { onShowHistory: () => void }) =>
  <button onClick={onShowHistory}>VIEW HISTORY</button> }));
import ProtectedLayout from '../../ProtectedLayout';
import SettingsPage from '../../pages/SettingsPage';
import { useEditorGuard } from '../../components/NavigationGuard';

function DraftWorkspace() {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  useEditorGuard(!!value, pending);
  return <><label>Draft weight<input value={value} onChange={event => setValue(event.target.value)} /></label>
    <button onClick={() => setPending(!pending)}>Toggle pending save</button></>;
}

function setup(initial = '/board', draft = false) {
  const router = createMemoryRouter([{ path: '/', element: <ProtectedLayout />, children: [
    { path: '/board', element: draft ? <DraftWorkspace /> : <p>BOARD CONTENT</p> },
    { path: '/status', element: <p>STATUS CONTENT</p> },
    { path: '/longquests', element: <p>CHAIN PROGRESSION CONTENT</p> },
    { path: '/history', element: <p>HISTORY CONTENT</p> },
    { path: '/settings', element: <SettingsPage /> },
  ] }], { initialEntries: [initial] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => { store.saveProfile.mockReset().mockResolvedValue(undefined); store.signOut.mockReset().mockResolvedValue({ error: null }); store.name = 'Yuki Tanaka'; });
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
  const router = setup();
  await user.click(screen.getByRole('button', { name: /Yuki Tanaka.*rank C/i }));
  await user.click(screen.getByRole('menuitem', { name: 'Edit details' }));
  await user.clear(screen.getByRole('textbox', { name: 'Display name' }));
  await user.type(screen.getByRole('textbox', { name: 'Display name' }), 'Unsaved');
  await router.navigate(-1);
  expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(await screen.findByRole('dialog', { name: 'EDIT DETAILS' })).toBeInTheDocument();
  expect(router.state.location.search).toBe('?account=profile');
  await router.navigate(-1);
  await user.click(await screen.findByRole('button', { name: 'Leave without saving' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(router.state.location.search).toBe(''));
  await router.navigate(1);
  expect(await screen.findByRole('dialog', { name: 'EDIT DETAILS' })).toBeInTheDocument();
});

it('closes a confirmed dirty profile save without a discard prompt', async () => {
  const user = userEvent.setup();
  const router = setup();
  await user.click(screen.getByRole('button', { name: /Yuki Tanaka.*rank C/i }));
  await user.click(screen.getByRole('menuitem', { name: 'Edit details' }));
  await user.type(screen.getByRole('textbox', { name: 'Display name' }), ' X');
  await user.click(screen.getByRole('button', { name: 'SAVE' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(router.state.location.search).toBe('');
  expect(store.saveProfile).toHaveBeenCalledOnce();
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

it('keeps named routes active and the account menu keyboard reachable with a long profile name', async () => {
  const user = userEvent.setup();
  store.name = 'M'.repeat(80);
  const router = setup();
  const board = screen.getByRole('link', { name: 'BOARD' });
  const status = screen.getByRole('link', { name: 'STATUS' });
  const longQuests = screen.getByRole('link', { name: 'CHAIN PROGRESSION' });
  expect(board).toHaveAttribute('aria-current', 'page');
  expect(status).not.toHaveAttribute('aria-current', 'page');
  expect(longQuests).not.toHaveAttribute('aria-current', 'page');

  await user.click(status);
  expect(await screen.findByText('STATUS CONTENT')).toBeInTheDocument();
  expect(status).toHaveAttribute('aria-current', 'page');
  expect(router.state.location.pathname).toBe('/status');

  const account = screen.getByRole('button', { name: `${store.name}, Ranger, rank C` });
  account.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('menu', { name: 'Account menu' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Edit details' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'BOARD' })).toBeVisible();
});

it('opens archived habits from the account menu and restores account focus', async () => {
  const user = userEvent.setup();
  const router = setup();
  const trigger = screen.getByRole('button', { name: /Yuki Tanaka.*rank C/i });
  await user.click(trigger);
  await user.click(screen.getByRole('menuitem', { name: 'Archived habits' }));
  expect(router.state.location.search).toBe('?account=archived');
  expect(screen.getByRole('dialog', { name: 'Archived habits' })).toHaveTextContent('No archived habits');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('guards dirty workspace logout, cancels without a write, and signs out only after consent', async () => {
  const user = userEvent.setup(); setup('/board', true);
  await user.type(screen.getByRole('textbox', { name: 'Draft weight' }), '20');
  await user.click(screen.getByRole('button', { name: /Yuki Tanaka.*rank C/i }));
  await user.click(screen.getByRole('menuitem', { name: 'Logout' }));
  expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
  expect(store.signOut).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('textbox', { name: 'Draft weight' })).toHaveValue('20');
  await user.click(screen.getByRole('menuitem', { name: 'Logout' }));
  await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
  await waitFor(() => expect(store.signOut).toHaveBeenCalledOnce());
});

it('prevents pending workspace logout even when the form is not dirty', async () => {
  const user = userEvent.setup(); setup('/board', true);
  await user.click(screen.getByRole('button', { name: 'Toggle pending save' }));
  await user.click(screen.getByRole('button', { name: /Yuki Tanaka.*rank C/i }));
  await user.click(screen.getByRole('menuitem', { name: 'Logout' }));
  expect(screen.getByRole('dialog', { name: 'Save in progress' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Leave without saving' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(store.signOut).not.toHaveBeenCalled();
});

it('keeps the workspace and exposes a failed logout after explicit consent', async () => {
  const user = userEvent.setup(); setup('/board', true);
  store.signOut.mockResolvedValueOnce({ error: new Error('Sign out failed') });
  await user.type(screen.getByRole('textbox', { name: 'Draft weight' }), '20');
  await user.click(screen.getByRole('button', { name: /Yuki Tanaka.*rank C/i }));
  await user.click(screen.getByRole('menuitem', { name: 'Logout' }));
  await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign out failed');
  expect(screen.getByRole('textbox', { name: 'Draft weight' })).toHaveValue('20');
});

it('uses native refresh protection only for dirty or pending editor state and removes it on unmount', async () => {
  const user = userEvent.setup(); setup('/board', true);
  const unload = () => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
  expect(unload()).toBe(false);
  await user.type(screen.getByRole('textbox', { name: 'Draft weight' }), '20');
  expect(unload()).toBe(true);
  fireEvent.change(screen.getByRole('textbox', { name: 'Draft weight' }), { target: { value: '' } });
  expect(unload()).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Toggle pending save' }));
  expect(unload()).toBe(true);
  cleanup();
  expect(unload()).toBe(false);
});
