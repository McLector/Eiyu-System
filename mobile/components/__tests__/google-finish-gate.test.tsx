import { Dimensions, Text } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { GoogleFinishGate } from '../eiyu/google-finish-gate';
import { TestThemeProvider } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockStatus = jest.fn();
const mockAccept = jest.fn();
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  fetchTermsStatus: (...args: unknown[]) => mockStatus(...args),
  acceptTerms: (...args: unknown[]) => mockAccept(...args),
}));

type TestUser = { id: string; app_metadata?: Record<string, unknown> };
const googleUser: TestUser = { id: 'u1', app_metadata: { provider: 'google' } };
const passwordUser: TestUser = { id: 'u2', app_metadata: { provider: 'email' } };
const CONTINUE = { name: 'CONTINUE' };
const TERMS = 'I agree to the Privacy Policy & Terms';

const terms = (accepted: boolean, userId = 'u1') => ({ userId, accepted, version: accepted ? '2026-11-08-terms-v2' : null });

function tree(user: TestUser, onSignOut: jest.Mock) {
  return (
    <TestThemeProvider>
      <GoogleFinishGate user={user} onSignOut={onSignOut}><Text>App content</Text></GoogleFinishGate>
    </TestThemeProvider>
  );
}

async function mount(user: TestUser = googleUser, onSignOut: jest.Mock = jest.fn().mockResolvedValue({ error: null })) {
  const view = await render(tree(user, onSignOut));
  return { ...view, onSignOut };
}

beforeEach(() => {
  mockStatus.mockReset().mockResolvedValue(terms(false));
  mockAccept.mockReset().mockResolvedValue({ userId: 'u1', accepted: true, version: '2026-11-08-terms-v2' });
});

describe('who sees the Terms screen', () => {
  it('blocks the app for a new Google account with no Terms row', async () => {
    await mount();
    expect(await screen.findByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    expect(screen.queryByText('App content')).toBeNull();
  });

  it('keys on the missing row, not on Google: a password account without one sees it too', async () => {
    mockStatus.mockResolvedValue(terms(false, 'u2'));
    await mount(passwordUser);
    expect(await screen.findByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('lets an account that has accepted the Terms straight through', async () => {
    mockStatus.mockResolvedValue(terms(true));
    await mount();
    expect(await screen.findByText('App content')).toBeOnTheScreen();
  });

  it('does not treat a missing provider as a reason to skip the lookup', async () => {
    await mount({ id: 'u1' });
    expect(await screen.findByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
  });

  it('holds the app back while the status loads', async () => {
    mockStatus.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(screen.getByText('Checking your account…')).toBeOnTheScreen();
    expect(screen.queryByText('App content')).toBeNull();
  });

  it('never traps: a status read that fails opens the app', async () => {
    mockStatus.mockRejectedValue(new Error('network down'));
    await mount();
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Finish signing up' })).toBeNull();
  });

  it('never traps: a status that belongs to another account opens the app instead of asking', async () => {
    mockStatus.mockResolvedValue(terms(false, 'someone-else'));
    await mount();
    expect(await screen.findByText('App content')).toBeOnTheScreen();
  });

  it('keeps the ticked box when a token refresh hands over a new user object', async () => {
    const onSignOut = jest.fn();
    const view = await mount(googleUser, onSignOut);
    await fireEvent.press(await screen.findByRole('checkbox', { name: TERMS }));
    await view.rerender(tree({ ...googleUser }, onSignOut));
    expect(screen.getByRole('checkbox', { name: TERMS })).toBeChecked();
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('looks again when a different account signs in', async () => {
    const onSignOut = jest.fn();
    const view = await mount(googleUser, onSignOut);
    await screen.findByRole('header', { name: 'Finish signing up' });
    mockStatus.mockResolvedValue(terms(true, 'u2'));
    await view.rerender(tree(passwordUser, onSignOut));
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    expect(mockStatus).toHaveBeenCalledTimes(2);
  });

  it('shows the screen again after a restart, until the Terms are accepted', async () => {
    const first = await mount();
    expect(await screen.findByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    await first.unmount();
    await mount();
    expect(await screen.findByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    expect(screen.queryByText('App content')).toBeNull();
    expect(mockAccept).not.toHaveBeenCalled();
  });
});

describe('what the screen asks', () => {
  it('asks only for the Terms: no birthday, age or permission wording', async () => {
    await mount();
    await screen.findByRole('header', { name: 'Finish signing up' });
    expect(screen.queryByLabelText('Birthday')).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByText(/birthday|child|permission|under 12|ages 12/i)).toBeNull();
  });

  it('starts with the Terms box unticked and Continue disabled', async () => {
    await mount();
    expect(await screen.findByRole('checkbox', { name: TERMS })).not.toBeChecked();
    expect(screen.getByRole('button', CONTINUE)).toBeDisabled();
  });

  it('opens the Privacy Policy and the Terms of Use from the Terms row', async () => {
    await mount();
    await fireEvent.press(await screen.findByRole('link', { name: 'Terms of Use' }));
    expect(within(screen.getByTestId('legal-sheet')).getByText('Terms of Use')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Close Terms of Use' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }));
    expect(within(screen.getByTestId('legal-sheet')).getByText('SIGNING IN WITH GOOGLE')).toBeOnTheScreen();
  });
});

describe('continuing', () => {
  it('enables Continue once the box is ticked, accepts once for this account, then opens the app', async () => {
    await mount();
    await fireEvent.press(await screen.findByRole('checkbox', { name: TERMS }));
    expect(screen.getByRole('button', CONTINUE)).toBeEnabled();
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept).toHaveBeenCalledWith('u1');
  });

  it('un-ticking turns Continue off again, and nothing is saved', async () => {
    await mount();
    const box = await screen.findByRole('checkbox', { name: TERMS });
    await fireEvent.press(box);
    await fireEvent.press(screen.getByRole('checkbox', { name: TERMS }));
    expect(screen.getByRole('button', CONTINUE)).toBeDisabled();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('keeps the screen with an alert when saving fails, and a retry accepts once more', async () => {
    mockAccept.mockRejectedValueOnce(new Error('Could not save your agreement.'));
    await mount();
    await fireEvent.press(await screen.findByRole('checkbox', { name: TERMS }));
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your agreement.');
    expect(screen.getByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    expect(screen.queryByText('App content')).toBeNull();
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(await screen.findByText('App content')).toBeOnTheScreen();
    expect(mockAccept).toHaveBeenCalledTimes(2);
  });

  it('sends one request when Continue is pressed twice while saving', async () => {
    mockAccept.mockReturnValue(new Promise(() => {}));
    await mount();
    await fireEvent.press(await screen.findByRole('checkbox', { name: TERMS }));
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByRole('button', { name: /SAVING/ }));
    expect(mockAccept).toHaveBeenCalledTimes(1);
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
});

describe('at font scale 1.6', () => {
  const original = Dimensions.get('window');
  beforeEach(() => {
    Dimensions.set({ window: { ...original, width: 360, height: 640, fontScale: 1.6 }, screen: { ...original, width: 360, height: 640, fontScale: 1.6 } });
  });
  afterEach(() => Dimensions.set({ window: original, screen: original }));

  it('shows every control untruncated and continues', async () => {
    await mount();
    expect(await screen.findByRole('header', { name: 'Finish signing up' })).toBeOnTheScreen();
    for (const text of ['I agree to the', 'Privacy Policy', 'Terms of Use', 'CONTINUE', 'Sign out']) {
      expect(screen.getByText(text).props.numberOfLines).toBeUndefined();
    }
    await fireEvent.press(screen.getByRole('checkbox', { name: TERMS }));
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(await screen.findByText('App content')).toBeOnTheScreen();
  });
});
