// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mfa = vi.hoisted(() => ({
  listFactors: vi.fn(), enroll: vi.fn(), challengeAndVerify: vi.fn(), unenroll: vi.fn(), signOut: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { mfa: mfa } } }));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ signOut: mfa.signOut, user: { id: 'owner-a' } }) }));
import AdminMfa from '../AdminMfa';

afterEach(cleanup);
beforeEach(() => {
  Object.values(mfa).forEach(fn => fn.mockReset());
  mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null });
  mfa.enroll.mockResolvedValue({ data: { id: 'f-new', type: 'totp', totp: { qr_code: '<svg></svg>', secret: 'SECRETKEY', uri: 'otpauth://x' } }, error: null });
  mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
  mfa.unenroll.mockResolvedValue({ data: {}, error: null });
  mfa.signOut.mockResolvedValue({ error: null });
});

describe('AdminMfa verify', () => {
  beforeEach(() => {
    const factor = { id: 'f-1', factor_type: 'totp', status: 'verified' };
    mfa.listFactors.mockResolvedValue({ data: { all: [factor], totp: [factor] }, error: null });
  });
  it('asks for the code of the existing authenticator and verifies it', async () => {
    const done = vi.fn(); const user = userEvent.setup();
    render(<AdminMfa onVerified={done} />);
    const code = await screen.findByLabelText(/6-digit code/i);
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(mfa.enroll).not.toHaveBeenCalled();
    await user.type(code, '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f-1', code: '123456' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
  });
  it('rejects a short or non-numeric code without calling the server', async () => {
    const user = userEvent.setup();
    render(<AdminMfa onVerified={vi.fn()} />);
    await user.type(await screen.findByLabelText(/6-digit code/i), '12ab');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent(/6 digits/i);
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });
  it('shows a safe error on a wrong code, focuses it and does not continue', async () => {
    mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { message: 'Invalid TOTP code entered' } });
    const done = vi.fn(); const user = userEvent.setup();
    render(<AdminMfa onVerified={done} />);
    await user.type(await screen.findByLabelText(/6-digit code/i), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent(/did not work/i);
    expect(done).not.toHaveBeenCalled();
  });
  it('offers sign out', async () => {
    const user = userEvent.setup();
    render(<AdminMfa onVerified={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(mfa.signOut).toHaveBeenCalled();
  });
});

describe('AdminMfa enrol', () => {
  it('does not enrol until asked, then shows the QR and setup key and verifies', async () => {
    const done = vi.fn(); const user = userEvent.setup();
    render(<AdminMfa onVerified={done} />);
    const start = await screen.findByRole('button', { name: 'Set up authenticator app' });
    expect(mfa.enroll).not.toHaveBeenCalled();
    await user.click(start);
    expect(mfa.enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: 'totp' }));
    expect(await screen.findByRole('img', { name: /qr code/i })).toHaveAttribute('src', expect.stringMatching(/^data:image\/svg\+xml/));
    expect(screen.getByText('SECRETKEY')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/6-digit code/i), '654321');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f-new', code: '654321' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
  });
  it('removes an abandoned unverified factor before enrolling again', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [{ id: 'old', factor_type: 'totp', status: 'unverified' }], totp: [] }, error: null });
    const user = userEvent.setup();
    render(<AdminMfa onVerified={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Set up authenticator app' }));
    await waitFor(() => expect(mfa.enroll).toHaveBeenCalled());
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'old' });
  });
  it('shows a safe error when enrolment fails', async () => {
    mfa.enroll.mockResolvedValue({ data: null, error: { message: 'boom detail' } });
    const user = userEvent.setup();
    render(<AdminMfa onVerified={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Set up authenticator app' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveFocus();
    expect(alert).not.toHaveTextContent('boom');
  });
  it('shows a safe error when the factors cannot be listed', async () => {
    mfa.listFactors.mockResolvedValue({ data: null, error: { message: 'nope' } });
    render(<AdminMfa onVerified={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not check/i);
  });
});
