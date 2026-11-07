// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn() },
  oauth: { signInWithOAuth: vi.fn(), exchangeCodeForSession: vi.fn() },
  start: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({ supabase: { auth: api.auth } }));
vi.mock('../../lib/google-oauth', () => ({
  getGoogleOAuthClient: () => api.oauth,
  startGoogleSignIn: api.start,
}));

import WebAuth from '../WebAuth';
import { GOOGLE_CANCELLED_MESSAGE, GOOGLE_GENERIC_MESSAGE, GOOGLE_LINK_REFUSED_MESSAGE } from '@eiyu/shared';

beforeEach(() => {
  vi.resetAllMocks();
  api.start.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('Continue with Google', () => {
  it('is offered on sign-in and starts Google with this origin', async () => {
    const user = userEvent.setup();
    render(<WebAuth onLogin={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(api.start).toHaveBeenCalledWith(api.oauth, window.location.origin);
  });

  it('is offered on sign-up with the Terms line, without asking for the form first', async () => {
    const user = userEvent.setup();
    render(<WebAuth onLogin={vi.fn()} />);
    expect(screen.queryByText("You'll confirm the Terms right after Google.")).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.getByText("You'll confirm the Terms right after Google.")).toBeInTheDocument();
    expect(screen.queryByText(/birthday/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(api.auth.signUp).not.toHaveBeenCalled();
  });

  it('is not offered on the password reset form', async () => {
    const user = userEvent.setup();
    render(<WebAuth onLogin={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });

  it('shows only the safe message when starting fails, and lets the user try again', async () => {
    const user = userEvent.setup();
    api.start.mockRejectedValueOnce(new Error(GOOGLE_GENERIC_MESSAGE));
    render(<WebAuth onLogin={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(GOOGLE_GENERIC_MESSAGE);
    const button = screen.getByRole('button', { name: 'Continue with Google' });
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(api.start).toHaveBeenCalledTimes(2));
  });

  it('does not allow a second start while one is pending', async () => {
    const user = userEvent.setup();
    api.start.mockReturnValue(new Promise(() => {}));
    render(<WebAuth onLogin={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByRole('button', { name: /Opening Google/ })).toBeDisabled();
    expect(api.start).toHaveBeenCalledTimes(1);
  });

  it('clears a stale Google error when the mode changes', async () => {
    const user = userEvent.setup();
    render(<WebAuth onLogin={vi.fn()} googleMessage={{ text: GOOGLE_LINK_REFUSED_MESSAGE, cancelled: false }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(GOOGLE_LINK_REFUSED_MESSAGE);
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.queryByText(GOOGLE_LINK_REFUSED_MESSAGE)).not.toBeInTheDocument();
  });
});

describe('a Google result handed back to sign-in', () => {
  it('shows a refusal as an error', () => {
    render(<WebAuth onLogin={vi.fn()} googleMessage={{ text: GOOGLE_LINK_REFUSED_MESSAGE, cancelled: false }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(GOOGLE_LINK_REFUSED_MESSAGE);
  });

  it('shows a cancel as a neutral status, not an error', () => {
    render(<WebAuth onLogin={vi.fn()} googleMessage={{ text: GOOGLE_CANCELLED_MESSAGE, cancelled: true }} />);
    expect(screen.getByRole('status')).toHaveTextContent(GOOGLE_CANCELLED_MESSAGE);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
