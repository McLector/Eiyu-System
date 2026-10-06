import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import AuthScreen from '../../app/auth';
import { PasswordField } from '../ui/password-field';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/contexts/auth-store', () => ({
  useAuth: () => ({ signIn: jest.fn(), signUp: jest.fn(), resetPassword: jest.fn() }),
}));

function Harness({ error }: { error?: string }) {
  const [value, setValue] = useState('');
  return <PasswordField label="Password" value={value} onChangeText={setValue} error={error} />;
}

describe('PasswordField', () => {
  it('hides the text by default and reveals it with the eye button', async () => {
    await renderWithTheme(<Harness />);
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
    const show = screen.getByRole('button', { name: 'Show password' });
    expect(show).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }));
    await fireEvent.press(show);
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
  });

  it('keeps the typed value when toggled', async () => {
    await renderWithTheme(<Harness />);
    await fireEvent.changeText(screen.getByLabelText('Password'), 'Secret123!');
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveDisplayValue('Secret123!');
  });

  it('names the toggle after the field so two fields stay distinguishable', async () => {
    await renderWithTheme(<PasswordField label="Confirm password" value="" onChangeText={() => {}} />);
    expect(screen.getByRole('button', { name: 'Show confirm password' })).toBeOnTheScreen();
  });

  it('still shows the field error next to the toggle', async () => {
    await renderWithTheme(<Harness error="Too short" />);
    expect(screen.getByText('Too short')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeOnTheScreen();
  });
});

describe('auth screen password toggles', () => {
  it('login has one toggle; sign-up has two independent ones; mode switch hides again', async () => {
    await renderWithTheme(<AuthScreen />);
    expect(screen.getAllByRole('button', { name: /^Show .*password$/ })).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', false);

    await fireEvent.press(screen.getByText('Register'));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
    expect(screen.getAllByRole('button', { name: /^Show .*password$/ })).toHaveLength(2);

    await fireEvent.press(screen.getByRole('button', { name: 'Show confirm password' }));
    expect(screen.getByLabelText('Confirm password')).toHaveProp('secureTextEntry', false);
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
  });

  it('forgot-password has no toggle', async () => {
    await renderWithTheme(<AuthScreen />);
    await fireEvent.press(screen.getByLabelText('Forgot password?'));
    expect(screen.queryByRole('button', { name: /^Show .*password$/ })).toBeNull();
  });
});
