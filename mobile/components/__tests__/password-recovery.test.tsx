import {StrictMode} from 'react';
import {act, screen, userEvent, waitFor} from '@testing-library/react-native';
import {renderWithTheme, TestThemeProvider} from '../ui/test-theme';
import RecoveryScreen from '../../app/auth/recovery';
import {redirectRecoveryLink} from '../../lib/recovery-link';
const mockParams: {attempt?: string} = {};
const target = 'eiyusystem-dev://auth/recovery';
const hash = '#type=recovery&token_type=bearer&access_token=test-access&refresh_token=test-refresh';
function capture(suffix = hash) {
 mockParams.attempt = new URL(redirectRecoveryLink(target + suffix, target), 'https://local.test').searchParams.get('attempt') ?? undefined;
}
const mockSetParams = jest.fn(), mockReplace = jest.fn();
const mockRouter = {setParams: mockSetParams, replace: mockReplace};
const mockMain = {getSession: jest.fn()};
const mockRecovery = {setSession: jest.fn(), getUser: jest.fn(), updateUser: jest.fn(), signOut: jest.fn()};
jest.mock('expo-router', () => ({useLocalSearchParams: () => mockParams, useRouter: () => mockRouter}));
jest.mock('expo-linking', () => ({createURL: () => 'eiyusystem-dev://auth/recovery'}));
jest.mock('react-native-safe-area-context', () => ({useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0})}));
jest.mock('@/lib/supabase', () => ({supabase: {auth: {getSession: (...args: unknown[]) => mockMain.getSession(...args)}}, createRecoveryAuth: () => mockRecovery}));
beforeEach(() => {
 jest.clearAllMocks();
 capture();
 mockMain.getSession.mockResolvedValue({data: {session: null}, error: null});
 mockRecovery.setSession.mockResolvedValue({data: {user: {id: 'owner'}, session: {user: {id: 'owner'}}}, error: null});
 mockRecovery.getUser.mockResolvedValue({data: {user: {id: 'owner'}}, error: null});
 mockRecovery.updateUser.mockResolvedValue({data: {user: {id: 'owner'}}, error: null});
 mockRecovery.signOut.mockResolvedValue({error: null});
});
it('consumes the memory handoff and validates one isolated session in Strict Mode', async () => {
 await renderWithTheme(<StrictMode><RecoveryScreen/></StrictMode>);
 expect(await screen.findByLabelText('New password')).toBeOnTheScreen();
 expect(mockSetParams).not.toHaveBeenCalled();
 expect(mockRecovery.setSession).toHaveBeenCalledTimes(1);
});
it('rejects a malformed link without showing password fields', async () => {
 capture('#error=access_denied&error_description=private-detail');
 await renderWithTheme(<RecoveryScreen/>);
 expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or expired/);
 expect(screen.queryByLabelText('New password')).toBeNull();
 expect(mockRecovery.setSession).not.toHaveBeenCalled();
});
it('replaces an active recovery form when a new link arrives on the same route', async () => {
 const user = userEvent.setup();
 const view = await renderWithTheme(<RecoveryScreen/>);
 await user.type(await screen.findByLabelText('New password'), 'Unsaved-test-password-1');
 capture('#error=access_denied');
 await view.rerender(<TestThemeProvider><RecoveryScreen/></TestThemeProvider>);
 expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or expired/);
 expect(screen.queryByLabelText('New password')).toBeNull();
 expect(mockRecovery.updateUser).not.toHaveBeenCalled();
});
it('rejects a link belonging to another owner without updating a password', async () => {
 mockMain.getSession.mockResolvedValue({data: {session: {user: {id: 'other'}}}, error: null});
 await renderWithTheme(<RecoveryScreen/>);
 expect(await screen.findByRole('alert')).toHaveTextContent(/other account/);
 expect(mockRecovery.updateUser).not.toHaveBeenCalled();
});
it('validates confirmation, permits a failed-update retry, then removes the password fields', async () => {
 const user = userEvent.setup(); await renderWithTheme(<RecoveryScreen/>);
 await user.type(await screen.findByLabelText('New password'), 'Long-test-password-1');
 await user.type(screen.getByLabelText('Confirm new password'), 'mismatch');
 await user.press(screen.getByRole('button', {name: 'SAVE NEW PASSWORD'}));
 expect(await screen.findByRole('alert')).toHaveTextContent(/Passwords do not match/);
 expect(mockRecovery.updateUser).not.toHaveBeenCalled();
 await user.clear(screen.getByLabelText('Confirm new password'));
 await user.type(screen.getByLabelText('Confirm new password'), 'Long-test-password-1');
 mockRecovery.updateUser.mockResolvedValueOnce({data: {user: null}, error: new Error('offline')});
 await user.press(screen.getByRole('button', {name: 'SAVE NEW PASSWORD'}));
 expect(await screen.findByRole('alert')).toHaveTextContent(/could not be updated/);
 await user.press(screen.getByRole('button', {name: 'SAVE NEW PASSWORD'}));
 expect(await screen.findByRole('header', {name: 'Password updated'})).toBeOnTheScreen();
 expect(screen.queryByLabelText('New password')).toBeNull();
 expect(mockRecovery.signOut).toHaveBeenCalledWith({scope: 'local'});
 await user.press(screen.getByRole('button', {name: 'Back to sign in'}));
 expect(mockReplace).toHaveBeenCalledWith('/');
});
it('rejects an account switch while the initial validation is pending', async () => {
 let finish!: (value: unknown) => void;
 mockRecovery.setSession.mockReturnValueOnce(new Promise(resolve => {finish = resolve;}));
 await renderWithTheme(<RecoveryScreen/>);
 await waitFor(() => expect(mockRecovery.setSession).toHaveBeenCalledTimes(1));
 mockMain.getSession.mockResolvedValue({data: {session: {user: {id: 'other'}}}, error: null});
 await act(async () => finish({data: {user: {id: 'owner'}, session: {user: {id: 'owner'}}}, error: null}));
 expect(await screen.findByRole('alert')).toHaveTextContent(/other account/);
 expect(mockRecovery.updateUser).not.toHaveBeenCalled();
});
