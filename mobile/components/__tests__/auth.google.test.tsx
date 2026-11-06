import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { GOOGLE_LINK_REFUSED_MESSAGE } from '@eiyu/shared';

import AuthScreen from '../../app/auth';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockResetPassword = jest.fn();
const mockGoogle = jest.fn();
jest.mock('@/contexts/auth-store', () => ({
  useAuth: () => ({ signIn: mockSignIn, signUp: mockSignUp, resetPassword: mockResetPassword, signInWithGoogle: mockGoogle }),
}));

const GOOGLE = { name: 'CONTINUE WITH GOOGLE' };

beforeEach(() => {
  mockSignIn.mockReset();
  mockSignUp.mockReset();
  mockResetPassword.mockReset();
  mockGoogle.mockReset().mockResolvedValue({ error: null, cancelled: false });
});

describe('mobile auth: Continue with Google', () => {
  it('is on the sign-in form and starts the flow without touching the password form', async () => {
    await renderWithTheme(<AuthScreen />);
    await fireEvent.press(screen.getByRole('button', GOOGLE));
    expect(mockGoogle).toHaveBeenCalledTimes(1);
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is on the sign-up form with the birthday line, and needs no ticked boxes or typed fields', async () => {
    await renderWithTheme(<AuthScreen />);
    await fireEvent.press(screen.getByText('Register'));
    expect(screen.getByText("You'll confirm your birthday right after Google.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', GOOGLE));
    expect(mockGoogle).toHaveBeenCalledTimes(1);
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not show the birthday line on the sign-in form', async () => {
    await renderWithTheme(<AuthScreen />);
    expect(screen.queryByText("You'll confirm your birthday right after Google.")).toBeNull();
  });

  it('is not offered while resetting a password', async () => {
    await renderWithTheme(<AuthScreen />);
    await fireEvent.press(screen.getByLabelText('Forgot password?'));
    expect(screen.queryByRole('button', GOOGLE)).toBeNull();
  });

  it('shows a refusal message as an alert', async () => {
    mockGoogle.mockResolvedValue({ error: GOOGLE_LINK_REFUSED_MESSAGE, cancelled: false });
    await renderWithTheme(<AuthScreen />);
    await fireEvent.press(screen.getByRole('button', GOOGLE));
    expect(await screen.findByRole('alert')).toHaveTextContent(GOOGLE_LINK_REFUSED_MESSAGE);
  });

  it('shows nothing after a cancel or a dismissed browser', async () => {
    mockGoogle.mockResolvedValue({ error: null, cancelled: true });
    await renderWithTheme(<AuthScreen />);
    await fireEvent.press(screen.getByRole('button', GOOGLE));
    await waitFor(() => expect(mockGoogle).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', GOOGLE)).toBeEnabled();
  });

  it('clears an earlier Google message when the user tries again', async () => {
    mockGoogle.mockResolvedValueOnce({ error: GOOGLE_LINK_REFUSED_MESSAGE, cancelled: false });
    await renderWithTheme(<AuthScreen />);
    await fireEvent.press(screen.getByRole('button', GOOGLE));
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', GOOGLE));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('turns a rejected flow into a readable message, not a crash', async () => {
    mockGoogle.mockRejectedValue(new Error('raw provider text'));
    await renderWithTheme(<AuthScreen />);
    await fireEvent.press(screen.getByRole('button', GOOGLE));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Google sign-in did not work/);
    expect(alert).not.toHaveTextContent('raw provider text');
  });

  it('is busy while the browser is open and ignores a second press', async () => {
    let release: (value: unknown) => void = () => {};
    mockGoogle.mockReturnValue(new Promise(resolve => { release = resolve; }));
    await renderWithTheme(<AuthScreen />);
    await fireEvent.press(screen.getByRole('button', GOOGLE));
    await waitFor(() => expect(screen.getByRole('button', GOOGLE)).toBeDisabled());
    await fireEvent.press(screen.getByRole('button', GOOGLE));
    expect(mockGoogle).toHaveBeenCalledTimes(1);
    release({ error: null, cancelled: true });
    await waitFor(() => expect(screen.getByRole('button', GOOGLE)).toBeEnabled());
  });

  it('keeps the password form working', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    await renderWithTheme(<AuthScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'kaito@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'StrongPass1!');
    await fireEvent.press(screen.getByRole('button', { name: 'ENTER SYSTEM' }));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('kaito@example.com', 'StrongPass1!'));
    expect(mockGoogle).not.toHaveBeenCalled();
  });
});
