import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dimensions, Text } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
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
const mockAge = jest.fn();
const mockFinish = jest.fn();
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  fetchProcessingAccess: (...args: unknown[]) => mockFetch(...args),
  setProcessingConsent: (...args: unknown[]) => mockConsent(...args),
  setAccountBirthday: (...args: unknown[]) => mockBirthday(...args),
  fetchAccountAge: (...args: unknown[]) => mockAge(...args),
  finishGoogleSignup: (...args: unknown[]) => mockFinish(...args),
}));

const googleUser = { id: 'u1', app_metadata: { provider: 'google' } };
const passwordUser = { id: 'u2', app_metadata: { provider: 'email' } };
const LABEL = PROCESSING_NOTICES['age-screening'].label;
const FINISH = { name: 'FINISH SIGN-UP' };
const TERMS = 'I agree to the Privacy Policy & Terms';

function age(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u1', birthDate: null, pendingBirthDate: null, correctionPending: false,
    adultDeclared: false, trackerWritesPaused: false, version: 0, ...overrides,
  };
}

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

async function fillAndSubmit(birthday = '2000-01-01', consent = true, terms = true) {
  await fireEvent.changeText(await screen.findByLabelText('Birthday'), birthday);
  if (consent) await fireEvent.press(screen.getByRole('checkbox', { name: LABEL }));
  if (terms) await fireEvent.press(screen.getByRole('checkbox', { name: TERMS }));
  await fireEvent.press(screen.getByRole('button', FINISH));
}

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue(access());
  mockConsent.mockReset().mockResolvedValue(access({ ageConsent: true, consentVersion: 1 }));
  mockBirthday.mockReset();
  mockAge.mockReset().mockResolvedValue(age());
  mockFinish.mockReset().mockResolvedValue({ access: access({ ageConsent: true, consentVersion: 1 }), age: age({ birthDate: '2000-01-01', version: 1 }) });
});

function noSave() {
  expect(mockFinish).not.toHaveBeenCalled();
  expect(mockConsent).not.toHaveBeenCalled();
  expect(mockBirthday).not.toHaveBeenCalled();
}

describe('who sees the finish screen', () => {
  it('shows it, and blocks the app, for a Google account without age consent', async () => {
    await mount();
    expect(await screen.findByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    expect(screen.queryByText('App content')).toBeNull();
  });

  it('lets a Google account with consent and a birthday straight through', async () => {
    mockFetch.mockResolvedValue(access({ ageConsent: true }));
    mockAge.mockResolvedValue(age({ birthDate: '2000-01-01', version: 1 }));
    await mount();
    expect(await screen.findByText('App content')).toBeOnTheScreen();
  });

  it('shows it for a half-finished account: consent saved but no birthday', async () => {
    mockFetch.mockResolvedValue(access({ ageConsent: true, consentVersion: 1 }));
    await mount();
    expect(await screen.findByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    expect(screen.queryByText('App content')).toBeNull();
    expect(screen.getByRole('checkbox', { name: LABEL })).toBeChecked();
  });

  it('fails closed when the birthday status cannot be loaded', async () => {
    mockFetch.mockResolvedValue(access({ ageConsent: true }));
    mockAge.mockRejectedValueOnce(new Error('network down'));
    await mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t check your account/i);
    expect(screen.queryByText('App content')).toBeNull();
  });

  it('fails closed when the birthday status belongs to a different account', async () => {
    mockFetch.mockResolvedValue(access({ ageConsent: true }));
    mockAge.mockResolvedValue(age({ userId: 'someone-else', birthDate: '2000-01-01' }));
    await mount();
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(screen.queryByText('App content')).toBeNull();
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
    noSave();
  });
});

describe('finishing', () => {
  it('saves consent and birthday in one call for this account, then opens the app', async () => {
    await mount();
    await fillAndSubmit();
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    expect(mockFinish).toHaveBeenCalledTimes(1);
    expect(mockFinish).toHaveBeenCalledWith('2000-01-01', access());
    expect(mockConsent).not.toHaveBeenCalled();
    expect(mockBirthday).not.toHaveBeenCalled();
  });

  it('finishes a half-finished account with the one call, without asking for consent again', async () => {
    const half = access({ ageConsent: true, consentVersion: 1 });
    mockFetch.mockResolvedValue(half);
    await mount();
    await fillAndSubmit('2000-01-01', false);
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    expect(mockFinish).toHaveBeenCalledWith('2000-01-01', half);
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
    noSave();
  });

  it('does not save anything without the Terms box', async () => {
    await mount();
    await fillAndSubmit('2000-01-01', true, false);
    expect(await screen.findByRole('alert')).toHaveTextContent('Accept the Privacy Policy and Terms to continue.');
    noSave();
  });

  it('starts with the Terms box unticked, even for a half-finished account', async () => {
    mockFetch.mockResolvedValue(access({ ageConsent: true, consentVersion: 1 }));
    await mount();
    expect(await screen.findByRole('checkbox', { name: TERMS })).not.toBeChecked();
  });

  it('opens the Privacy Policy and the Terms of Use from the Terms row', async () => {
    await mount();
    await fireEvent.press(await screen.findByRole('link', { name: 'Terms of Use' }));
    expect(within(screen.getByTestId('legal-sheet')).getByText('Terms of Use')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Close Terms of Use' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }));
    expect(within(screen.getByTestId('legal-sheet')).getByText('SIGNING IN WITH GOOGLE')).toBeOnTheScreen();
  });

  it.each(['2000-13-45', '', 'not a date'])('rejects the birthday %p without saving', async birthday => {
    await mount();
    await fillAndSubmit(birthday);
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    noSave();
  });

  it('rejects a birthday under 12 with the sign-up message, without saving', async () => {
    await mount();
    await fillAndSubmit(`${new Date().getFullYear() - 5}-01-01`);
    expect(await screen.findByRole('alert')).toHaveTextContent('New Eiyu accounts are for ages 12 and above.');
    noSave();
  });

  it('keeps the user on the screen with an error when the save fails, and a retry sends the same call', async () => {
    mockFinish.mockRejectedValueOnce(new Error('birthday failed'));
    await mount();
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    expect(screen.queryByText('App content')).toBeNull();
    await fireEvent.press(screen.getByRole('button', FINISH));
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    expect(mockFinish).toHaveBeenCalledTimes(2);
    expect(mockFinish.mock.calls[1]).toEqual(['2000-01-01', access()]);
  });

  it('ignores a second press while saving', async () => {
    mockFinish.mockReturnValue(new Promise(() => {}));
    await mount();
    await fillAndSubmit();
    await waitFor(() => expect(mockFinish).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByRole('button', { name: /SAVING/ }));
    expect(mockFinish).toHaveBeenCalledTimes(1);
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

describe('at font scale 1.6', () => {
  const original = Dimensions.get('window');
  beforeEach(() => {
    Dimensions.set({ window: { ...original, width: 360, height: 640, fontScale: 1.6 }, screen: { ...original, width: 360, height: 640, fontScale: 1.6 } });
  });
  afterEach(() => Dimensions.set({ window: original, screen: original }));

  it('shows every control untruncated and finishes', async () => {
    await mount();
    expect(await screen.findByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    for (const text of [PROCESSING_NOTICES['age-screening'].body, LABEL, 'I agree to the', 'Privacy Policy', 'Terms of Use', 'FINISH SIGN-UP', 'Sign out']) {
      expect(screen.getByText(text).props.numberOfLines).toBeUndefined();
    }
    expect(screen.getByRole('checkbox', { name: TERMS })).toBeOnTheScreen();
    expect(screen.getByLabelText('Birthday')).toBeOnTheScreen();
    await fillAndSubmit();
    expect(await screen.findByText('App content')).toBeOnTheScreen();
  });
});
