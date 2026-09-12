// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

import WebAuth from '../WebAuth';

afterEach(cleanup);

async function openAndFillSignup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Register' }));
  await user.type(screen.getByLabelText('Display name'), 'Kaito');
  await user.type(screen.getByLabelText('Email address'), 'kaito@example.com');
  await user.type(screen.getByLabelText('Password'), 'StrongPass1!');
  await user.type(screen.getByLabelText('Confirm password'), 'StrongPass1!');
}

describe('web registration legal documents', () => {
  beforeEach(() => {
    auth.signInWithPassword.mockReset().mockResolvedValue({ error: null });
    auth.signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    auth.resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  });

  it('opens both unauthenticated documents, traps initial focus, closes on Escape, and preserves form state', async () => {
    const user = userEvent.setup();
    render(<WebAuth onLogin={vi.fn()} />);
    await openAndFillSignup(user);

    const consent = screen.getByRole('checkbox', { name: 'I agree to the Privacy Policy & Terms' });
    const privacyLink = screen.getByRole('button', { name: 'Privacy Policy' });
    expect(consent).not.toBeChecked();

    await user.click(privacyLink);
    expect(screen.getByRole('dialog', { name: 'Privacy Policy' })).toBeInTheDocument();
    const closePrivacy = screen.getByRole('button', { name: 'Close Privacy Policy' });
    const privacyContent = screen.getByLabelText('Privacy Policy content');
    expect(privacyContent).toHaveStyle({ overflowY: 'auto' });
    expect(closePrivacy).toHaveFocus();
    expect(screen.getByText('DATA WE COLLECT')).toBeInTheDocument();
    expect(consent).not.toBeChecked();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(privacyContent).toHaveFocus();
    await user.tab();
    expect(closePrivacy).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(privacyLink).toHaveFocus();

    expect(screen.getByLabelText('Email address')).toHaveValue('kaito@example.com');
    await user.click(consent);
    await user.click(screen.getByRole('button', { name: 'Terms of Use' }));
    expect(screen.getByRole('dialog', { name: 'Terms of Use' })).toBeInTheDocument();
    expect(screen.getByText('TERMS OF USE')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close Terms of Use' }));
    expect(consent).toBeChecked();
  });

  it('keeps submit disabled until consent and calls the real auth boundary after acceptance', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<WebAuth onLogin={onLogin} />);
    await openAndFillSignup(user);

    const submit = screen.getByRole('button', { name: 'BEGIN JOURNEY' });
    expect(submit).toBeDisabled();
    expect(auth.signUp).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: 'I agree to the Privacy Policy & Terms' }));
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(auth.signUp).toHaveBeenCalledOnce());
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'kaito@example.com',
      password: 'StrongPass1!',
      options: { data: { display_name: 'Kaito', time_zone: expect.any(String) } },
    });
    expect(onLogin).not.toHaveBeenCalled();
  });
});
