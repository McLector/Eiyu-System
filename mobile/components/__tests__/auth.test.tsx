import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { authErrorMessage, confirmEmailMessage, resetLinkSentMessage } from '@eiyu/shared';

import AuthScreen from '../../app/auth';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockResetPassword = jest.fn();

jest.mock('@/contexts/auth-store', () => ({
  useAuth: () => ({ signIn: mockSignIn, signUp: mockSignUp, resetPassword: mockResetPassword }),
}));

const render = (ui = <AuthScreen />) => renderWithTheme(ui);

async function openSignup() {
  await render();
  await fireEvent.press(screen.getByText('Register'));
}

async function fillSignup() {
  await fireEvent.changeText(screen.getByLabelText('Display name'), 'Kaito');
  await fireEvent.changeText(screen.getByLabelText('Email address'), 'kaito@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'StrongPass1!');
  await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'StrongPass1!');
}

const CONSENT = { name: 'I agree to the Privacy Policy & Terms' };

describe('mobile auth: flat card', () => {
  beforeEach(() => {
    mockSignIn.mockReset().mockResolvedValue({ error: null });
    mockSignUp.mockReset().mockResolvedValue({ error: null, needsEmailConfirmation: true });
    mockResetPassword.mockReset().mockResolvedValue({ error: null });
  });

  it('puts the form on exactly one signature panel', async () => {
    await render();
    expect(screen.getAllByTestId('panel-corner-tl', { includeHiddenElements: true })).toHaveLength(1);
  });

  it('shows the login form with the System voice subtitle', async () => {
    await render();
    expect(screen.getByText('Enter the system')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'ENTER SYSTEM' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Display name')).toBeNull();
  });

  it('shows no field error before the first submit, then inline alerts without calling the server', async () => {
    await render();
    expect(screen.queryByRole('alert')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'ENTER SYSTEM' }));
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('signs in with the trimmed email', async () => {
    await render();
    await fireEvent.changeText(screen.getByLabelText('Email address'), '  kaito@example.com ');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'StrongPass1!');
    await fireEvent.press(screen.getByRole('button', { name: 'ENTER SYSTEM' }));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('kaito@example.com', 'StrongPass1!'));
  });

  it('words a refused sign-in in the System voice', async () => {
    mockSignIn.mockResolvedValue({ error: 'Invalid login credentials' });
    await render();
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'kaito@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'StrongPass1!');
    await fireEvent.press(screen.getByRole('button', { name: 'ENTER SYSTEM' }));
    expect(await screen.findByText(authErrorMessage('login', 'Invalid login credentials'))).toBeOnTheScreen();
  });

  it('shows a busy button while a sign-in is pending and ignores a second press', async () => {
    let finish: (value: { error: null }) => void = () => {};
    mockSignIn.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await render();
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'kaito@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'StrongPass1!');
    await fireEvent.press(screen.getByRole('button', { name: 'ENTER SYSTEM' }));
    const busy = await screen.findByRole('button', { name: 'WORKING…' });
    expect(busy).toBeDisabled();
    await fireEvent.press(busy);
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ error: null }); });
    expect(screen.getByRole('button', { name: 'ENTER SYSTEM' })).toBeEnabled();
  });

  describe('forgot password', () => {
    const openForgot = async () => {
      await render();
      await fireEvent.press(screen.getByText('Forgot password?'));
    };

    it('asks only for the email', async () => {
      await openForgot();
      expect(screen.getByText('Reset access')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Password')).toBeNull();
      expect(screen.getByRole('button', { name: 'SEND RECOVERY LINK' })).toBeOnTheScreen();
    });

    it('confirms with the mail badge, web title and message, then returns to login', async () => {
      await openForgot();
      await fireEvent.changeText(screen.getByLabelText('Email address'), 'kaito@example.com');
      await fireEvent.press(screen.getByRole('button', { name: 'SEND RECOVERY LINK' }));
      expect(await screen.findByText('MESSAGE DISPATCHED')).toBeOnTheScreen();
      expect(screen.getByText(resetLinkSentMessage('kaito@example.com'))).toBeOnTheScreen();
      expect(screen.getByTestId('auth-notice-mail')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'BACK TO LOGIN' }));
      expect(screen.getByRole('button', { name: 'ENTER SYSTEM' })).toBeOnTheScreen();
    });

    it('words a failed send in the System voice and stays on the form', async () => {
      mockResetPassword.mockResolvedValue({ error: 'rate limited' });
      await openForgot();
      await fireEvent.changeText(screen.getByLabelText('Email address'), 'kaito@example.com');
      await fireEvent.press(screen.getByRole('button', { name: 'SEND RECOVERY LINK' }));
      expect(await screen.findByText(authErrorMessage('forgot', 'rate limited'))).toBeOnTheScreen();
      expect(screen.queryByText('MESSAGE DISPATCHED')).toBeNull();
    });
  });

  describe('registration', () => {
    it('keeps the email but clears password, confirmation and consent when switching mode', async () => {
      await openSignup();
      await fillSignup();
      await fireEvent.press(screen.getByRole('checkbox', CONSENT));
      await fireEvent.press(screen.getByText('Sign in'));
      expect(screen.getByLabelText('Email address')).toHaveDisplayValue('kaito@example.com');
      expect(screen.getByLabelText('Password')).toHaveDisplayValue('');
      await fireEvent.press(screen.getByText('Register'));
      expect(screen.getByLabelText('Confirm password')).toHaveDisplayValue('');
      expect(screen.getByRole('checkbox', CONSENT)).not.toBeChecked();
    });

    it('labels an under-minimum password as too short, not acceptable strength', async () => {
      await openSignup();
      await fireEvent.changeText(screen.getByLabelText('Password'), 'abc');
      expect(screen.getByText('Too short')).toBeOnTheScreen();
      expect(screen.queryByText('Okay')).toBeNull();
    });

    it('blocks submit until consent is given and says why, inline under the checkbox', async () => {
      await openSignup();
      await fillSignup();
      await fireEvent.press(screen.getByRole('button', { name: 'BEGIN JOURNEY' }));
      expect(screen.getByText('Accept the Privacy Policy and Terms to continue.')).toBeOnTheScreen();
      expect(mockSignUp).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole('checkbox', CONSENT));
      await fireEvent.press(screen.getByRole('button', { name: 'BEGIN JOURNEY' }));
      await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
      expect(mockSignUp).toHaveBeenCalledWith('kaito@example.com', 'StrongPass1!', 'Kaito');
    });

    it('gives the consent checkbox a 48dp target', async () => {
      await openSignup();
      const style = StyleSheet.flatten(screen.getByRole('checkbox', CONSENT).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
    });

    it('shows the check badge with the web title and message when a confirmation mail is needed', async () => {
      await openSignup();
      await fillSignup();
      await fireEvent.press(screen.getByRole('checkbox', CONSENT));
      await fireEvent.press(screen.getByRole('button', { name: 'BEGIN JOURNEY' }));
      expect(await screen.findByText('ALMOST THERE')).toBeOnTheScreen();
      expect(screen.getByText(confirmEmailMessage('kaito@example.com'))).toBeOnTheScreen();
      expect(screen.getByTestId('auth-notice-check')).toBeOnTheScreen();
      expect(screen.queryByText(/[\u{1F300}-\u{1FAFF}✅]/u)).toBeNull();
    });

    it('shows no notice and no error when sign-up signs the user straight in', async () => {
      mockSignUp.mockResolvedValue({ error: null, needsEmailConfirmation: false });
      await openSignup();
      await fillSignup();
      await fireEvent.press(screen.getByRole('checkbox', CONSENT));
      await fireEvent.press(screen.getByRole('button', { name: 'BEGIN JOURNEY' }));
      await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
      expect(screen.queryByText('ALMOST THERE')).toBeNull();
      expect(screen.queryByText(/enrollment/)).toBeNull();
    });

    it('words a failed sign-up in the System voice', async () => {
      mockSignUp.mockResolvedValue({ error: 'User already registered' });
      await openSignup();
      await fillSignup();
      await fireEvent.press(screen.getByRole('checkbox', CONSENT));
      await fireEvent.press(screen.getByRole('button', { name: 'BEGIN JOURNEY' }));
      expect(await screen.findByText(authErrorMessage('signup', 'User already registered'))).toBeOnTheScreen();
    });
  });

  describe('legal documents', () => {
    it('opens each in a sheet without changing consent or clearing the entered values', async () => {
      await openSignup();
      await fillSignup();
      const consent = screen.getByRole('checkbox', CONSENT);
      expect(consent).not.toBeChecked();

      await fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }));
      const sheet = screen.getByTestId('legal-sheet');
      expect(within(sheet).getByText('Privacy Policy')).toBeOnTheScreen();
      expect(within(sheet).getByText('DATA WE COLLECT')).toBeOnTheScreen();
      expect(within(sheet).getByText(/Your account email, display name/)).toHaveProp('selectable', true);
      expect(screen.getByRole('button', { name: 'Close Privacy Policy' })).toBeOnTheScreen();
      expect(consent).not.toBeChecked();
      await fireEvent.press(screen.getByRole('button', { name: 'Close Privacy Policy' }));

      expect(screen.getByLabelText('Email address')).toHaveDisplayValue('kaito@example.com');
      expect(screen.getByLabelText('Display name')).toHaveDisplayValue('Kaito');

      await fireEvent.press(consent);
      expect(consent).toBeChecked();
      await fireEvent.press(screen.getByRole('link', { name: 'Terms of Use' }));
      expect(within(screen.getByTestId('legal-sheet')).getByText('Terms of Use')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Close Terms of Use' }));
      expect(consent).toBeChecked();
    });

    it('has no legal sheet open until a link is pressed', async () => {
      await openSignup();
      expect(screen.queryByTestId('legal-sheet-panel')).toBeNull();
    });
  });
});
