// @vitest-environment jsdom
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import {StrictMode} from 'react';
import {MemoryRouter, Route, Routes, useLocation} from 'react-router-dom';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
const api = vi.hoisted(() => ({
 main: {getSession: vi.fn()},
 recovery: {setSession: vi.fn(), getUser: vi.fn(), updateUser: vi.fn(), signOut: vi.fn()},
}));
vi.mock('../../lib/supabase', () => ({supabase: {auth: api.main}, createRecoveryAuth: () => api.recovery}));
import PasswordRecoveryPage from '../PasswordRecoveryPage';
const hash = '#type=recovery&token_type=bearer&access_token=test-access&refresh_token=test-refresh';
function LocationProbe() {const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>;}
function setup(fragment = hash) {
 return render(<StrictMode><MemoryRouter initialEntries={['/auth/recovery' + fragment]}><LocationProbe/><Routes>
  <Route path="/auth/recovery" element={<PasswordRecoveryPage/>}/>
  <Route path="/auth" element={<p>Sign-in destination</p>}/>
 </Routes></MemoryRouter></StrictMode>);
}
beforeEach(() => {
 vi.resetAllMocks();
 api.main.getSession.mockResolvedValue({data: {session: null}, error: null});
 api.recovery.setSession.mockResolvedValue({data: {user: {id: 'owner'}, session: {user: {id: 'owner'}}}, error: null});
 api.recovery.getUser.mockResolvedValue({data: {user: {id: 'owner'}}, error: null});
 api.recovery.updateUser.mockResolvedValue({data: {user: {id: 'owner'}}, error: null});
 api.recovery.signOut.mockResolvedValue({error: null});
});
afterEach(cleanup);

it('strips callback credentials and validates once under Strict Mode before showing the form', async () => {
 setup();
 expect(await screen.findByLabelText('New password')).toHaveAttribute('type', 'password');
 expect(screen.getByTestId('location')).toHaveTextContent(/^\/auth\/recovery$/);
 expect(api.recovery.setSession).toHaveBeenCalledTimes(1);
 expect(api.recovery.setSession).toHaveBeenCalledWith({access_token: 'test-access', refresh_token: 'test-refresh'});
});
it('rejects invalid and expired links without exposing provider details or a password form', async () => {
 api.recovery.setSession.mockResolvedValue({data: {user: null, session: null}, error: new Error('private-detail')});
 setup();
 expect(await screen.findByRole('alert')).toHaveTextContent('This recovery link is invalid or expired.');
 expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
 expect(screen.queryByText(/private-detail/)).not.toBeInTheDocument();
});
it('rejects another signed-in owner without replacing their normal session', async () => {
 api.main.getSession.mockResolvedValue({data: {session: {user: {id: 'other'}}}, error: null});
 setup();
 expect(await screen.findByRole('alert')).toHaveTextContent(/other account/);
 expect(api.recovery.updateUser).not.toHaveBeenCalled();
});
it('shows a mismatch before submitting and permits inline retry after a failed update', async () => {
 const user = userEvent.setup(); setup();
 await user.type(await screen.findByLabelText('New password'), 'Long-test-password-1');
 await user.type(screen.getByLabelText('Confirm new password'), 'mismatch');
 await user.click(screen.getByRole('button', {name: 'SAVE NEW PASSWORD'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match.');
 expect(api.recovery.updateUser).not.toHaveBeenCalled();
 await user.clear(screen.getByLabelText('Confirm new password'));
 await user.type(screen.getByLabelText('Confirm new password'), 'Long-test-password-1');
 api.recovery.updateUser.mockResolvedValueOnce({data: {user: null}, error: new Error('offline')});
 await user.click(screen.getByRole('button', {name: 'SAVE NEW PASSWORD'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Your password could not be updated.');
 expect(screen.getByLabelText('New password')).toBeEnabled();
 await user.click(screen.getByRole('button', {name: 'SAVE NEW PASSWORD'}));
 expect(await screen.findByRole('heading', {name: 'Password updated'})).toBeInTheDocument();
 expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
 expect(api.recovery.signOut).toHaveBeenCalledWith({scope: 'local'});
 await user.click(screen.getByRole('link', {name: 'Back to sign in'}));
 expect(await screen.findByText('Sign-in destination')).toBeInTheDocument();
});
it('does not update a newly selected account while link validation is pending', async () => {
 let finish!: (value: unknown) => void;
 api.recovery.setSession.mockReturnValueOnce(new Promise(resolve => {finish = resolve;}));
 setup();
 await waitFor(() => expect(api.recovery.setSession).toHaveBeenCalledTimes(1));
 api.main.getSession.mockResolvedValue({data: {session: {user: {id: 'other'}}}, error: null});
 await act(async () => finish({data: {user: {id: 'owner'}, session: {user: {id: 'owner'}}}, error: null}));
 expect(await screen.findByRole('alert')).toHaveTextContent(/other account/);
 expect(api.recovery.updateUser).not.toHaveBeenCalled();
});
