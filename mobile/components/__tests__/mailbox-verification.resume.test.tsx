// F2: the code box resumes after an app restart, and has a clear look and clear states (mirrors the web F1 tests).
import {act, fireEvent, screen, userEvent, waitFor} from '@testing-library/react-native';
import {renderWithTheme, TestThemeProvider} from '../ui/test-theme';
import {MailboxVerification} from '../status/mailbox-verification';

const mockStatus = jest.fn(), mockSend = jest.fn(), mockVerify = jest.fn();
jest.mock('@eiyu/shared', () => ({...jest.requireActual('@eiyu/shared'), fetchMailboxStatus: (...args: unknown[]) => mockStatus(...args), sendMailboxCode: (...args: unknown[]) => mockSend(...args), verifyMailboxCode: (...args: unknown[]) => mockVerify(...args)}));

const ID = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b';
const OTHER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const pending = (over: Partial<{id: string; resendAfter: number}> = {}) => ({id: ID, expiresAt: '2026-11-08T12:10:00+00:00', resendAfter: 40, ...over});
const status = (over: Record<string, unknown> = {}) => ({userId: 'owner', version: 1, verified: false, challenge: null, ...over});
const mount = (props: Record<string, unknown> = {}) => renderWithTheme(<MailboxVerification userId="owner" onVerified={jest.fn()} {...props} />);
const again = (props: Record<string, unknown> = {}) => <TestThemeProvider><MailboxVerification userId="owner" onVerified={jest.fn()} {...props} /></TestThemeProvider>;

beforeEach(() => {
  // mockReset (not clear) so an unused mockReturnValueOnce from one test can never reach the next.
  mockStatus.mockReset(); mockSend.mockReset(); mockVerify.mockReset();
  mockStatus.mockResolvedValue(status());
  mockSend.mockResolvedValue({challengeId: ID, retryAfter: 60});
  mockVerify.mockResolvedValue(status({verified: true}));
});

// ---- resume after an app restart -------------------------------------------------------------------------
it('shows the code box and the seeded resend countdown straight away when the server has a pending code', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending({resendAfter: 40})}));
  await mount();
  expect(await screen.findByLabelText('Verification code')).toBeEnabled();
  expect(screen.getByRole('button', {name: 'Resend in 40s'})).toBeDisabled();
  expect(mockSend).not.toHaveBeenCalled();
});

it('lets the person resend at once when the pending code is past its resend wait', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending({resendAfter: 0})}));
  await mount();
  await screen.findByLabelText('Verification code');
  expect(screen.getByRole('button', {name: 'Resend verification email'})).toBeEnabled();
});

it('shows only "Send verification email" when no code is pending', async () => {
  await mount();
  expect(await screen.findByRole('button', {name: 'Send verification email'})).toBeEnabled();
  expect(screen.queryByLabelText('Verification code')).toBeNull();
});

it('never shows a code box for an already verified mailbox, even if a challenge came with the status', async () => {
  mockStatus.mockResolvedValue(status({verified: true, challenge: pending()}));
  await mount({purpose: 'account-export'});
  await screen.findByRole('button', {name: 'Send verification email'});
  expect(screen.queryByLabelText('Verification code')).toBeNull();
});

it('resumes after a simulated restart: unmount, then mount again against the same server status', async () => {
  const user = userEvent.setup();
  const first = await mount();
  await user.press(await screen.findByRole('button', {name: 'Send verification email'}));
  await screen.findByLabelText('Verification code');
  mockStatus.mockResolvedValue(status({challenge: pending({resendAfter: 52})}));
  await first.unmount();
  await mount();
  expect(await screen.findByLabelText('Verification code')).toBeEnabled();
  expect(screen.getByRole('button', {name: 'Resend in 52s'})).toBeDisabled();
  expect(screen.queryByRole('button', {name: 'Send verification email'})).toBeNull();
});

it('a resumed code can be verified with the challenge id the server reported', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending()}));
  const user = userEvent.setup(), done = jest.fn();
  await mount({onVerified: done});
  await user.type(await screen.findByLabelText('Verification code'), '123456');
  await user.press(screen.getByRole('button', {name: 'Verify code'}));
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(mockVerify).toHaveBeenCalledWith(ID, '123456', expect.objectContaining({userId: 'owner', version: 1}));
});

it('a passive refresh with the same pending code keeps what the person has typed and the countdown', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending({resendAfter: 40})}));
  const user = userEvent.setup();
  const view = await mount();
  await user.type(await screen.findByLabelText('Verification code'), '1234');
  mockStatus.mockResolvedValue(status({challenge: pending({resendAfter: 10})}));
  await view.rerender(again({refreshRevision: 1}));
  await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('Verification code').props.value).toBe('1234');
  // The countdown keeps running from 40 (a slow machine may have ticked it); it is not reset to the refresh's 10.
  const left = Number(/Resend in (\d+)s/.exec(String(screen.getByRole('button', {name: /Resend in \d+s/}).props.accessibilityLabel ?? ''))?.[1] ?? NaN);
  expect(left).toBeGreaterThanOrEqual(30);
});

// ---- expired or superseded ---------------------------------------------------------------------------------
it('an expired code: a status check that finds no pending code hides the box and says to send a new one', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending({resendAfter: 40})}));
  const user = userEvent.setup();
  await mount();
  await user.type(await screen.findByLabelText('Verification code'), '123456');
  mockStatus.mockResolvedValue(status({challenge: null}));
  await user.press(screen.getByRole('button', {name: 'Check verification status'}));
  expect(await screen.findByText('That code expired. Send a new one.')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Verification code')).toBeNull();
  expect(screen.getByRole('button', {name: 'Send verification email'})).toBeEnabled();
});

it('a different pending code (sent from another device) replaces the one on screen and clears the draft', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending({id: ID})}));
  const user = userEvent.setup();
  const view = await mount();
  await user.type(await screen.findByLabelText('Verification code'), '999999');
  mockStatus.mockResolvedValue(status({challenge: pending({id: OTHER_ID, resendAfter: 55})}));
  await view.rerender(again({refreshRevision: 1}));
  await screen.findByRole('button', {name: 'Resend in 55s'});
  expect(screen.getByLabelText('Verification code').props.value).toBe('');
  await user.type(screen.getByLabelText('Verification code'), '123456');
  await user.press(screen.getByRole('button', {name: 'Verify code'}));
  await waitFor(() => expect(mockVerify).toHaveBeenCalledWith(OTHER_ID, '123456', expect.anything()));
});

it('the mailbox email changing under a held code shows the expired state', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending()}));
  const view = await mount();
  await screen.findByLabelText('Verification code');
  mockStatus.mockResolvedValue(status({version: 2, challenge: null}));
  await view.rerender(again({refreshRevision: 1}));
  expect(await screen.findByText('That code expired. Send a new one.')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Verification code')).toBeNull();
});

it('a status read that started before a resend finished cannot wipe the new code', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending({resendAfter: 0})}));
  mockSend.mockResolvedValue({challengeId: OTHER_ID, retryAfter: 60});
  const user = userEvent.setup();
  let finishStale!: (v: unknown) => void;
  const view = await mount();
  await screen.findByLabelText('Verification code');
  mockStatus.mockReturnValueOnce(new Promise(resolve => { finishStale = resolve; }));
  await view.rerender(again({refreshRevision: 1}));
  await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(2));
  await user.press(screen.getByRole('button', {name: 'Resend verification email'}));
  await screen.findByRole('button', {name: 'Resend in 60s'});
  await act(async () => { finishStale(status({challenge: null})); });
  expect(screen.getByLabelText('Verification code')).toBeEnabled();
  expect(screen.queryByText('That code expired. Send a new one.')).toBeNull();
  expect(screen.getByRole('button', {name: 'Resend in 60s'})).toBeOnTheScreen();
});

// ---- the look ------------------------------------------------------------------------------------------------
it('the box is labelled, hinted and set up for one-time codes', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending()}));
  await mount();
  const input = await screen.findByLabelText('Verification code');
  expect(screen.getByText('Enter the code from your email')).toBeOnTheScreen();
  expect(input.props.keyboardType).toBe('number-pad');
  expect(input.props.autoComplete).toBe('one-time-code');
  expect(input.props.textContentType).toBe('oneTimeCode');
  expect(input.props.autoCorrect).toBe(false);
});

it('shows large, letter-spaced, monospace digits', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending()}));
  await mount();
  const flat = Object.assign({}, ...[(await screen.findByLabelText('Verification code')).props.style].flat(5).filter(Boolean));
  expect(flat.fontSize).toBeGreaterThanOrEqual(22);
  expect(flat.letterSpacing).toBeGreaterThan(2);
  expect(String(flat.fontFamily)).toMatch(/JetBrainsMono/);
  expect(flat.textAlign).toBe('center');
});

it('keeps digits only: letters and punctuation are dropped', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending()}));
  const user = userEvent.setup();
  await mount();
  const input = await screen.findByLabelText('Verification code');
  await user.type(input, 'a1b2-c3 4');
  expect(screen.getByLabelText('Verification code').props.value).toBe('1234');
});

it('normalises a pasted code such as "123 456" to 123456', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending()}));
  await mount();
  await fireEvent.changeText(await screen.findByLabelText('Verification code'), '123 456');
  expect(screen.getByLabelText('Verification code').props.value).toBe('123456');
});

it('never keeps more than ten digits, even from a long paste', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending()}));
  await mount();
  await fireEvent.changeText(await screen.findByLabelText('Verification code'), '123 456 789 012 345');
  expect(screen.getByLabelText('Verification code').props.value).toBe('1234567890');
});

it('Verify code is off below six digits and on from six to ten', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending()}));
  await mount();
  const input = await screen.findByLabelText('Verification code');
  expect(screen.getByRole('button', {name: 'Verify code'})).toBeDisabled();
  await fireEvent.changeText(input, '12345');
  expect(screen.getByRole('button', {name: 'Verify code'})).toBeDisabled();
  await fireEvent.changeText(input, '123456');
  expect(screen.getByRole('button', {name: 'Verify code'})).toBeEnabled();
  await fireEvent.changeText(input, '1234567890');
  expect(screen.getByRole('button', {name: 'Verify code'})).toBeEnabled();
});

// ---- states -------------------------------------------------------------------------------------------------
it('says it is sending, then that the code was sent and lasts ten minutes', async () => {
  const user = userEvent.setup();
  let finish!: (v: unknown) => void;
  mockSend.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await mount();
  await user.press(await screen.findByRole('button', {name: 'Send verification email'}));
  expect(await screen.findByText('Sending your code…')).toBeOnTheScreen();
  await act(async () => { finish({challengeId: ID, retryAfter: 60}); });
  expect(await screen.findByText('We sent a code to your email. It lasts 10 minutes.')).toBeOnTheScreen();
  expect(screen.queryByText('Sending your code…')).toBeNull();
});

it('a resumed box says a code is waiting rather than claiming it was just sent', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending()}));
  await mount();
  await screen.findByLabelText('Verification code');
  expect(screen.getByText('A code is waiting. Enter it below, or send a new one.')).toBeOnTheScreen();
  expect(screen.queryByText(/We sent a code/)).toBeNull();
});

it('a send that fails shows an alert and no code box', async () => {
  mockSend.mockRejectedValueOnce(new Error('Email verification is temporarily unavailable.'));
  const user = userEvent.setup();
  await mount();
  await user.press(await screen.findByRole('button', {name: 'Send verification email'}));
  expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/);
  expect(screen.queryByLabelText('Verification code')).toBeNull();
  expect(screen.queryByText('Sending your code…')).toBeNull();
});

it('a wrong code keeps the box and its digits, shows an alert, and does not say "verified"', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending()}));
  mockVerify.mockRejectedValueOnce(new Error('That code could not be verified.'));
  const user = userEvent.setup(), done = jest.fn();
  await mount({onVerified: done});
  await user.type(await screen.findByLabelText('Verification code'), '654321');
  await user.press(screen.getByRole('button', {name: 'Verify code'}));
  expect(await screen.findByRole('alert')).toHaveTextContent(/That code/);
  expect(screen.getByLabelText('Verification code').props.value).toBe('654321');
  expect(screen.queryByText('Email verified')).toBeNull();
  expect(done).not.toHaveBeenCalled();
});

it('marks the verify button busy while the code is being checked', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending()}));
  const user = userEvent.setup();
  let finish!: (v: unknown) => void;
  mockVerify.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await mount();
  await user.type(await screen.findByLabelText('Verification code'), '123456');
  await user.press(screen.getByRole('button', {name: 'Verify code'}));
  expect(screen.getByRole('button', {name: 'Verify code'})).toBeBusy();
  expect(screen.getByRole('button', {name: 'Verify code'})).toBeDisabled();
  await act(async () => { finish(status({verified: true})); });
});

it('success shows "Email verified" and calls onVerified once', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending()}));
  const user = userEvent.setup(), done = jest.fn();
  await mount({onVerified: done});
  await user.type(await screen.findByLabelText('Verification code'), '123456');
  await user.press(screen.getByRole('button', {name: 'Verify code'}));
  expect(await screen.findByText('Email verified')).toBeOnTheScreen();
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(screen.queryByLabelText('Verification code')).toBeNull();
});

it('after success no resend countdown lingers: the button goes back to "Send verification email"', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending({resendAfter: 40})}));
  const user = userEvent.setup();
  await mount();
  await user.type(await screen.findByLabelText('Verification code'), '123456');
  await user.press(screen.getByRole('button', {name: 'Verify code'}));
  await screen.findByText('Email verified');
  expect(screen.queryByRole('button', {name: /Resend/})).toBeNull();
  expect(screen.getByRole('button', {name: 'Send verification email'})).toBeEnabled();
});

it('changing account resets a resumed box and does not carry the code to the other account', async () => {
  mockStatus.mockResolvedValue(status({challenge: pending()}));
  const view = await mount();
  await screen.findByLabelText('Verification code');
  mockStatus.mockResolvedValue(status({userId: 'other', challenge: null}));
  await view.rerender(again({userId: 'other'}));
  await screen.findByRole('button', {name: 'Send verification email'});
  expect(screen.queryByLabelText('Verification code')).toBeNull();
  expect(screen.queryByText('That code expired. Send a new one.')).toBeNull();
});

it('a status answer that arrives after unmount sets no state', async () => {
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  let finish!: (v: unknown) => void;
  mockStatus.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = await mount();
  await view.unmount();
  await act(async () => { finish(status({challenge: pending()})); });
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

it('a failed status read shows an alert, not a dead box', async () => {
  mockStatus.mockRejectedValue(new Error('Email verification status is unavailable.'));
  await mount();
  expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/);
  expect(screen.queryByLabelText('Verification code')).toBeNull();
});
