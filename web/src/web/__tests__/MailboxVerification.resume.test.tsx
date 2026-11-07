// @vitest-environment jsdom
// F1: the code box resumes after a reload, and has a clear, labelled look and clear states.
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';

const api = vi.hoisted(() => ({fetchMailboxStatus: vi.fn(), sendMailboxCode: vi.fn(), verifyMailboxCode: vi.fn()}));
vi.mock('@eiyu/shared', () => ({...api, MAILBOX_MESSAGE: 'Verify your email to access your weekly debrief.', formatError: (e: Error) => e.message}));
import MailboxVerification from '../MailboxVerification';

const ID = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b';
const OTHER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const pending = (over: Partial<{id: string; resendAfter: number}> = {}) =>
  ({id: ID, expiresAt: '2026-11-08T12:10:00+00:00', resendAfter: 40, ...over});
const status = (over: Record<string, unknown> = {}) =>
  ({userId: 'owner', version: 1, verified: false, challenge: null, ...over});

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchMailboxStatus.mockResolvedValue(status());
  api.sendMailboxCode.mockResolvedValue({challengeId: ID, retryAfter: 60});
  api.verifyMailboxCode.mockResolvedValue(status({verified: true}));
});
afterEach(cleanup);

// ---- resume after a reload ------------------------------------------------------------------------------
it('shows the code box and the seeded resend countdown straight away when the server has a pending code', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending({resendAfter: 40})}));
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  expect(await screen.findByLabelText('Verification code')).toBeEnabled();
  expect(screen.getByRole('button', {name: 'Resend in 40s'})).toBeDisabled();
  expect(api.sendMailboxCode).not.toHaveBeenCalled();
});

it('lets the person resend at once when the pending code is past its resend wait', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending({resendAfter: 0})}));
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  await screen.findByLabelText('Verification code');
  expect(screen.getByRole('button', {name: 'Resend verification email'})).toBeEnabled();
});

it('shows only "Send verification email" when no code is pending', async () => {
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  expect(await screen.findByRole('button', {name: 'Send verification email'})).toBeEnabled();
  expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
});

it('never shows a code box for an already verified mailbox, even if a challenge came with the status', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({verified: true, challenge: pending()}));
  render(<MailboxVerification userId="owner" purpose="account-export" onVerified={vi.fn()} />);
  await screen.findByRole('button', {name: 'Send verification email'});
  expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
});

it('resumes after a simulated reload: unmount, then mount again against the same server status', async () => {
  const user = userEvent.setup();
  const first = render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  await user.click(await screen.findByRole('button', {name: 'Send verification email'}));
  await screen.findByLabelText('Verification code');
  // The server now holds the code we just sent; the page reloads.
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending({resendAfter: 52})}));
  first.unmount();
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  expect(await screen.findByLabelText('Verification code')).toBeEnabled();
  expect(screen.getByRole('button', {name: 'Resend in 52s'})).toBeDisabled();
  expect(screen.queryByRole('button', {name: 'Send verification email'})).not.toBeInTheDocument();
});

it('a resumed code can be verified with the challenge id the server reported', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending()}));
  const user = userEvent.setup(), done = vi.fn();
  render(<MailboxVerification userId="owner" onVerified={done} />);
  await user.type(await screen.findByLabelText('Verification code'), '123456');
  await user.click(screen.getByRole('button', {name: 'Verify code'}));
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(api.verifyMailboxCode).toHaveBeenCalledWith(ID, '123456', expect.objectContaining({userId: 'owner', version: 1}));
});

it('a passive refresh with the same pending code keeps what the person has typed and the countdown', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending({resendAfter: 40})}));
  const user = userEvent.setup();
  const view = render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  await user.type(await screen.findByLabelText('Verification code'), '1234');
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending({resendAfter: 10})}));
  view.rerender(<MailboxVerification userId="owner" refreshRevision={1} onVerified={vi.fn()} />);
  await waitFor(() => expect(api.fetchMailboxStatus).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('Verification code')).toHaveValue('1234');
  expect(screen.getByRole('button', {name: 'Resend in 40s'})).toBeInTheDocument();
});

// ---- expired or superseded -------------------------------------------------------------------------------
it('an expired code: a status check that finds no pending code hides the box and says to send a new one', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending({resendAfter: 40})}));
  const user = userEvent.setup();
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  await user.type(await screen.findByLabelText('Verification code'), '123456');
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: null}));
  await user.click(screen.getByRole('button', {name: 'Check verification status'}));
  expect(await screen.findByText('That code expired. Send a new one.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Send verification email'})).toBeEnabled();
});

it('a different pending code (sent from another tab) replaces the one on screen and clears the draft', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending({id: ID})}));
  const user = userEvent.setup();
  const view = render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  await user.type(await screen.findByLabelText('Verification code'), '999999');
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending({id: OTHER_ID, resendAfter: 55})}));
  view.rerender(<MailboxVerification userId="owner" refreshRevision={1} onVerified={vi.fn()} />);
  await screen.findByRole('button', {name: 'Resend in 55s'});
  expect(screen.getByLabelText('Verification code')).toHaveValue('');
  await user.type(screen.getByLabelText('Verification code'), '123456');
  await user.click(screen.getByRole('button', {name: 'Verify code'}));
  await waitFor(() => expect(api.verifyMailboxCode).toHaveBeenCalledWith(OTHER_ID, '123456', expect.anything()));
});

it('the mailbox email changing under a held code shows the expired state', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending()}));
  const view = render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  await screen.findByLabelText('Verification code');
  api.fetchMailboxStatus.mockResolvedValue(status({version: 2, challenge: null}));
  view.rerender(<MailboxVerification userId="owner" refreshRevision={1} onVerified={vi.fn()} />);
  expect(await screen.findByText('That code expired. Send a new one.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
});

it('a status read that started before a resend finished cannot wipe the new code', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending({resendAfter: 0})}));
  api.sendMailboxCode.mockResolvedValue({challengeId: OTHER_ID, retryAfter: 60});
  const user = userEvent.setup();
  let finishStale!: (v: unknown) => void;
  const view = render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  await screen.findByLabelText('Verification code');
  // A passive refresh starts and its answer is held back; meanwhile the person resends.
  api.fetchMailboxStatus.mockReturnValueOnce(new Promise(resolve => { finishStale = resolve; }));
  view.rerender(<MailboxVerification userId="owner" refreshRevision={1} onVerified={vi.fn()} />);
  await waitFor(() => expect(api.fetchMailboxStatus).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole('button', {name: 'Resend verification email'}));
  await screen.findByRole('button', {name: 'Resend in 60s'});
  // The old read now lands and says "no pending code": it described the world before the resend.
  await act(async () => { finishStale(status({challenge: null})); });
  expect(screen.getByLabelText('Verification code')).toBeEnabled();
  expect(screen.queryByText('That code expired. Send a new one.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Resend in 60s'})).toBeInTheDocument();
});

// ---- the look ---------------------------------------------------------------------------------------------
it('the box is labelled, hinted and set up for one-time codes', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending()}));
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  const input = await screen.findByLabelText('Verification code');
  expect(screen.getByText('Enter the code from your email')).toBeVisible();
  expect(input).toHaveAttribute('inputmode', 'numeric');
  expect(input).toHaveAttribute('autocomplete', 'one-time-code');
  expect(input).toHaveAttribute('pattern', '[0-9]*');
  expect(input).toHaveClass('code-input');
  expect(input).toHaveAccessibleDescription('Enter the code from your email');
});

it('keeps digits only: typing letters and punctuation is ignored', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending()}));
  const user = userEvent.setup();
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  const input = await screen.findByLabelText('Verification code');
  await user.type(input, 'a1b2-c3 4');
  expect(input).toHaveValue('1234');
});

it('normalises a pasted code such as "123 456" to 123456', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending()}));
  const user = userEvent.setup();
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  const input = await screen.findByLabelText('Verification code');
  await user.click(input);
  await user.paste('123 456');
  expect(input).toHaveValue('123456');
});

it('never keeps more than ten digits, even from a long paste', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending()}));
  const user = userEvent.setup();
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  const input = await screen.findByLabelText('Verification code');
  await user.click(input);
  await user.paste('123 456 789 012 345');
  expect(input).toHaveValue('1234567890');
});

it('Verify code is off below six digits and on from six to ten', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending()}));
  const user = userEvent.setup();
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  const input = await screen.findByLabelText('Verification code');
  const verify = screen.getByRole('button', {name: 'Verify code'});
  expect(verify).toBeDisabled();
  await user.type(input, '12345');
  expect(verify).toBeDisabled();
  await user.type(input, '6');
  expect(verify).toBeEnabled();
  await user.type(input, '7890');
  expect(verify).toBeEnabled();
});

// ---- states -----------------------------------------------------------------------------------------------
it('says it is sending, then that the code was sent and lasts ten minutes', async () => {
  const user = userEvent.setup();
  let finish!: (v: unknown) => void;
  api.sendMailboxCode.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  await user.click(await screen.findByRole('button', {name: 'Send verification email'}));
  expect(await screen.findByText('Sending your code…')).toBeInTheDocument();
  await act(async () => { finish({challengeId: ID, retryAfter: 60}); });
  expect(await screen.findByText('We sent a code to your email. It lasts 10 minutes.')).toBeInTheDocument();
  expect(screen.queryByText('Sending your code…')).not.toBeInTheDocument();
});

it('a resumed box says a code is waiting rather than claiming it was just sent', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending()}));
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  await screen.findByLabelText('Verification code');
  expect(screen.getByText('A code is waiting. Enter it below, or send a new one.')).toBeInTheDocument();
  expect(screen.queryByText(/We sent a code/)).not.toBeInTheDocument();
});

it('a send that fails shows an alert and no code box', async () => {
  api.sendMailboxCode.mockRejectedValueOnce(new Error('Email verification is temporarily unavailable.'));
  const user = userEvent.setup();
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  await user.click(await screen.findByRole('button', {name: 'Send verification email'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
  expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
  expect(screen.queryByText('Sending your code…')).not.toBeInTheDocument();
});

it('a wrong code keeps the box and its digits, shows an alert, and does not say "verified"', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending()}));
  api.verifyMailboxCode.mockRejectedValueOnce(new Error('That code could not be verified.'));
  const user = userEvent.setup(), done = vi.fn();
  render(<MailboxVerification userId="owner" onVerified={done} />);
  await user.type(await screen.findByLabelText('Verification code'), '654321');
  await user.click(screen.getByRole('button', {name: 'Verify code'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('That code');
  expect(screen.getByLabelText('Verification code')).toHaveValue('654321');
  expect(screen.queryByText('Email verified')).not.toBeInTheDocument();
  expect(done).not.toHaveBeenCalled();
});

it('marks the verify button busy while the code is being checked', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending()}));
  const user = userEvent.setup();
  let finish!: (v: unknown) => void;
  api.verifyMailboxCode.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  await user.type(await screen.findByLabelText('Verification code'), '123456');
  await user.click(screen.getByRole('button', {name: 'Verify code'}));
  expect(screen.getByRole('button', {name: 'Verify code'})).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('button', {name: 'Verify code'})).toBeDisabled();
  await act(async () => { finish(status({verified: true})); });
});

it('success shows "Email verified" and calls onVerified once', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending()}));
  const user = userEvent.setup(), done = vi.fn();
  render(<MailboxVerification userId="owner" onVerified={done} />);
  await user.type(await screen.findByLabelText('Verification code'), '123456');
  await user.click(screen.getByRole('button', {name: 'Verify code'}));
  expect(await screen.findByText('Email verified')).toBeInTheDocument();
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
});

it('after success no resend countdown lingers: the button goes back to "Send verification email"', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending({resendAfter: 40})}));
  const user = userEvent.setup();
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  await user.type(await screen.findByLabelText('Verification code'), '123456');
  await user.click(screen.getByRole('button', {name: 'Verify code'}));
  await screen.findByText('Email verified');
  expect(screen.queryByRole('button', {name: /Resend/})).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Send verification email'})).toBeEnabled();
});

it('changing account resets a resumed box and does not carry the code to the other account', async () => {
  api.fetchMailboxStatus.mockResolvedValue(status({challenge: pending()}));
  const view = render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  await screen.findByLabelText('Verification code');
  api.fetchMailboxStatus.mockResolvedValue(status({userId: 'other', challenge: null}));
  view.rerender(<MailboxVerification userId="other" onVerified={vi.fn()} />);
  await screen.findByRole('button', {name: 'Send verification email'});
  expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
  expect(screen.queryByText('That code expired. Send a new one.')).not.toBeInTheDocument();
});

it('a status answer that arrives after unmount sets no state', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  let finish!: (v: unknown) => void;
  api.fetchMailboxStatus.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const view = render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  view.unmount();
  await act(async () => { finish(status({challenge: pending()})); });
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

it('a malformed status failure shows an alert, not a dead box', async () => {
  api.fetchMailboxStatus.mockRejectedValueOnce(new Error('Email verification status is unavailable.'));
  render(<MailboxVerification userId="owner" onVerified={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
});
