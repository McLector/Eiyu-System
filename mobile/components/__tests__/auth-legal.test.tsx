import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AuthScreen from '../../app/auth';

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockResetPassword = jest.fn();

jest.mock('@/contexts/auth-store', () => ({
  useAuth: () => ({ signIn: mockSignIn, signUp: mockSignUp, resetPassword: mockResetPassword }),
}));

jest.mock('@/contexts/eiyu-store', () => ({
  useEiyu: () => ({
    theme: {
      accent: '#00ffff', accentBorder: '#336666', accentGlass: '#113333', body: '#000000',
      dim: '#777777', glassBorder: '#333333', modal: '#111111', muted: '#aaaaaa',
      overlay: '#000000', text: '#ffffff', track: '#222222',
    },
  }),
}));

jest.mock('@/components/eiyu/ghost-button', () => ({
  GhostButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => {
    const { Pressable, Text } = jest.requireActual('react-native');
    return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}><Text>{label}</Text></Pressable>;
  },
}));
jest.mock('@/components/eiyu/glass-view', () => ({ GlassView: 'GlassView' }));
jest.mock('@/components/eiyu/page-background', () => ({ PageBackground: () => null }));
jest.mock('@/components/eiyu/screen', () => ({ Screen: 'Screen' }));
jest.mock('@/components/eiyu/icons', () => ({ CheckIcon: () => null }));

async function openSignup() {
  await render(<AuthScreen />);
  await fireEvent.press(screen.getByText('Register'));
}

async function fillSignup() {
  await fireEvent.changeText(screen.getByLabelText('Display name'), 'Kaito');
  await fireEvent.changeText(screen.getByLabelText('Email address'), 'kaito@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'StrongPass1!');
  await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'StrongPass1!');
}

describe('mobile registration legal documents', () => {
  beforeEach(() => {
    mockSignIn.mockReset().mockResolvedValue({ error: null });
    mockSignUp.mockReset().mockResolvedValue({ error: null, needsEmailConfirmation: true });
    mockResetPassword.mockReset().mockResolvedValue({ error: null });
  });

  it('opens each document without changing consent or clearing entered registration values', async () => {
    await openSignup();
    await fillSignup();

    const consent = screen.getByRole('checkbox', { name: 'Accept Privacy Policy and Terms' });
    expect(consent).not.toBeChecked();

    await fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }));
    expect(screen.getByText('PRIVACY POLICY')).toBeOnTheScreen();
    expect(screen.getByText('DATA WE COLLECT')).toBeOnTheScreen();
    expect(screen.getByLabelText('Privacy Policy content')).toHaveProp('contentInsetAdjustmentBehavior', 'automatic');
    expect(screen.getByText(/Your account email, display name/)).toHaveProp('selectable', true);
    expect(consent).not.toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Close Privacy Policy' }));

    expect(screen.getByLabelText('Email address')).toHaveDisplayValue('kaito@example.com');
    expect(screen.getByLabelText('Display name')).toHaveDisplayValue('Kaito');

    await fireEvent.press(consent);
    expect(consent).toBeChecked();
    await fireEvent.press(screen.getByRole('link', { name: 'Terms of Use' }));
    expect(screen.getAllByText('TERMS OF USE')).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Close Terms of Use' }));
    expect(consent).toBeChecked();
  });

  it('keeps consent required at the registration boundary and signs up after acceptance', async () => {
    await openSignup();
    await fillSignup();

    await fireEvent.press(screen.getByRole('button', { name: 'BEGIN JOURNEY' }));
    expect(screen.getByText('Please accept the Privacy Policy & Terms to continue.')).toBeOnTheScreen();
    expect(mockSignUp).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Accept Privacy Policy and Terms' }));
    await fireEvent.press(screen.getByRole('button', { name: 'BEGIN JOURNEY' }));
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
    expect(mockSignUp).toHaveBeenCalledWith('kaito@example.com', 'StrongPass1!', 'Kaito');
  });
});
