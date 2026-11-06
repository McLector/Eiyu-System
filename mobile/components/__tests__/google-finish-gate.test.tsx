import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PROCESSING_NOTICES } from '@eiyu/shared';

import { GoogleFinishGate } from '../eiyu/google-finish-gate';
import { TestThemeProvider } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockFetch = jest.fn();
const mockConsent = jest.fn();
const mockBirthday = jest.fn();
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  fetchProcessingAccess: (...args: unknown[]) => mockFetch(...args),
  setProcessingConsent: (...args: unknown[]) => mockConsent(...args),
  setAccountBirthday: (...args: unknown[]) => mockBirthday(...args),
}));

const googleUser = { id: 'u1', app_metadata: { provider: 'google' } };
const passwordUser = { id: 'u2', app_metadata: { provider: 'email' } };
const LABEL = PROCESSING_NOTICES['age-screening'].label;
const FINISH = { name: 'FINISH SIGN-UP' };

function access(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: 1, userId: 'u1', ageVersion: 0, consentVersion: 0, authorityVersion: 0, mailboxVersion: 1,
    ageEligible: false, canReadDebrief: false, canGenerateDebrief: false, authorityState: 'not-required',
    ageConsent: false, aiConsent: false, ...overrides,
  };
}

function tree(user: { id: string; app_metadata?: Record<string, unknown> } = googleUser, onSignOut = jest.fn().mockResolvedValue({ error: null })) {
  return {
    onSignOut,
    ui: (
      <TestThemeProvider>
        <GoogleFinishGate user={user} onSignOut={onSignOut}><Text>App content</Text></GoogleFinishGate>
      </TestThemeProvider>
    ),
  };
}

async function mount(user?: { id: string; app_metadata?: Record<string, unknown> }, onSignOut?: jest.Mock) {
  const t = tree(user, onSignOut);
  const view = await render(t.ui);
  return { ...view, onSignOut: t.onSignOut };
}

async function fillAndSubmit(birthday = '2000-01-01', consent = true) {
  await fireEvent.changeText(await screen.findByLabelText('Birthday'), birthday);
  if (consent) await fireEvent.press(screen.getByRole('checkbox', { name: LABEL }));
  await fireEvent.press(screen.getByRole('button', FINISH));
}

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue(access());
  mockConsent.mockReset().mockResolvedValue(access({ ageConsent: true, consentVersion: 1 }));
  mockBirthday.mockReset().mockResolvedValue({ userId: 'u1', birthDate: '2000-01-01' });
});

describe('who sees the finish screen', () => {
  it('shows it, and blocks the app, for a Google account without age consent', async () => {
    await mount();
    expect(await screen.findByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    expect(screen.queryByText('App content')).toBeNull();
  });

  it('lets a Google account that already has consent straight through', async () => {
    mockFetch.mockResolvedValue(access({ ageConsent: true }));
    await mount();
    expect(await screen.findByText('App content')).toBeOnTheScreen();
  });

  it('never asks a password account, and does not even look up its status', async () => {
    await mount(passwordUser);
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not treat a missing provider as Google', async () => {
    await mount({ id: 'u3' });
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('holds the app back while the status loads', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(screen.getByText('Checking your account…')).toBeOnTheScreen();
    expect(screen.queryByText('App content')).toBeNull();
  });

  it('fails closed when the status cannot be loaded, with retry and sign-out', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    const { onSignOut } = await mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t check your account/i);
    expect(screen.queryByText('App content')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
  });

  it('fails closed when the status belongs to a different account', async () => {
    mockFetch.mockResolvedValue(access({ userId: 'someone-else', ageConsent: true }));
    await mount();
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(screen.queryByText('App content')).toBeNull();
  });

  it('keeps what was typed when a token refresh hands over a new user object', async () => {
    const onSignOut = jest.fn();
    const view = await mount(googleUser, onSignOut);
    await fireEvent.changeText(await screen.findByLabelText('Birthday'), '2000-01-01');
    await view.rerender(tree({ ...googleUser }, onSignOut).ui);
    expect(screen.getByLabelText('Birthday').props.value).toBe('2000-01-01');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('shows the screen again after sign-out and sign-in if it was abandoned', async () => {
    const first = await mount();
    expect(await screen.findByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    await first.unmount();
    await mount();
    expect(await screen.findByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    expect(mockConsent).not.toHaveBeenCalled();
    expect(mockBirthday).not.toHaveBeenCalled();
  });
});

describe('finishing', () => {
  it('saves consent first, then the birthday for this account, then opens the app', async () => {
    await mount();
    await fillAndSubmit();
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    expect(mockConsent).toHaveBeenCalledWith('age-screening', true, PROCESSING_NOTICES['age-screening'].version, access());
    expect(mockBirthday).toHaveBeenCalledWith('2000-01-01', 'u1');
    expect(mockConsent.mock.invocationCallOrder[0]).toBeLessThan(mockBirthday.mock.invocationCallOrder[0]);
  });

  it('shows the birthday notice and the permission wording before asking', async () => {
    await mount();
    expect(await screen.findByText(PROCESSING_NOTICES['age-screening'].body)).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: LABEL })).toBeOnTheScreen();
  });

  it('does not save anything without the permission box', async () => {
    await mount();
    await fillAndSubmit('2000-01-01', false);
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission/i);
    expect(mockConsent).not.toHaveBeenCalled();
    expect(mockBirthday).not.toHaveBeenCalled();
  });

  it.each(['2000-13-45', '', 'not a date'])('rejects the birthday %p without saving', async birthday => {
    await mount();
    await fillAndSubmit(birthday);
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(mockConsent).not.toHaveBeenCalled();
    expect(mockBirthday).not.toHaveBeenCalled();
  });

  it('rejects a birthday under 12 with the sign-up message, without saving', async () => {
    await mount();
    await fillAndSubmit(`${new Date().getFullYear() - 5}-01-01`);
    expect(await screen.findByRole('alert')).toHaveTextContent('New Eiyu accounts are for ages 12 and above.');
    expect(mockConsent).not.toHaveBeenCalled();
    expect(mockBirthday).not.toHaveBeenCalled();
  });

  it('keeps the user on the screen and shows an error when the consent save fails', async () => {
    mockConsent.mockRejectedValue(new Error('permission denied'));
    await mount();
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    expect(screen.queryByText('App content')).toBeNull();
    expect(mockBirthday).not.toHaveBeenCalled();
  });

  it('keeps the user on the screen when the birthday save fails after consent saved, and retries without re-sending consent', async () => {
    mockBirthday.mockRejectedValueOnce(new Error('birthday failed'));
    await mount();
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    expect(screen.queryByText('App content')).toBeNull();
    await fireEvent.press(screen.getByRole('button', FINISH));
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    expect(mockConsent).toHaveBeenCalledTimes(1);
    expect(mockBirthday).toHaveBeenCalledTimes(2);
  });

  it('ignores a second press while saving', async () => {
    mockConsent.mockReturnValue(new Promise(() => {}));
    await mount();
    await fillAndSubmit();
    await waitFor(() => expect(mockConsent).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByRole('button', { name: /SAVING/ }));
    expect(mockConsent).toHaveBeenCalledTimes(1);
  });

  it('keeps sign-out available, and uses it', async () => {
    const { onSignOut } = await mount();
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('survives a sign-out that rejects', async () => {
    const onSignOut = jest.fn().mockRejectedValue(new Error('offline'));
    await mount(googleUser, onSignOut);
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
  });

  it('never writes the birth date to device storage', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    await mount();
    await fillAndSubmit('1999-07-04');
    await screen.findByText('App content');
    expect(setItem.mock.calls.map(call => `${call[0]}=${call[1]}`).join('|')).not.toContain('1999-07-04');
    setItem.mockRestore();
  });
});
