// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

import WebAuth from '../WebAuth';

afterEach(cleanup);

describe('web auth: show password', () => {
  it('hides the password by default and reveals it with the eye button, then hides it again', async () => {
    const user = userEvent.setup();
    render(<WebAuth onLogin={vi.fn()} />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');

    const show = screen.getByRole('button', { name: 'Show password' });
    expect(show).toHaveAttribute('aria-pressed', 'false');
    await user.click(show);
    expect(input).toHaveAttribute('type', 'text');
    const hide = screen.getByRole('button', { name: 'Hide password' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');

    await user.click(hide);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('keeps what was typed when the password is revealed', async () => {
    const user = userEvent.setup();
    render(<WebAuth onLogin={vi.fn()} />);
    await user.type(screen.getByLabelText('Password'), 'Secret123!');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveValue('Secret123!');
  });

  it('gives sign-up two independent toggles', async () => {
    const user = userEvent.setup();
    render(<WebAuth onLogin={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show confirm password' }));
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('type', 'text');
  });

  it('hides the password again when the form switches mode', async () => {
    const user = userEvent.setup();
    render(<WebAuth onLogin={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('has no toggle on the forgot-password form, which has no password', async () => {
    const user = userEvent.setup();
    render(<WebAuth onLogin={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.queryByRole('button', { name: /show .*password/i })).toBeNull();
  });

  it('does not submit the form when the eye button is pressed', async () => {
    const user = userEvent.setup();
    render(<WebAuth onLogin={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
