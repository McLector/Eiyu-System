// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

import WebAuth from '../WebAuth';

afterEach(cleanup);

async function enterSignup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Register' }));
}

describe('web auth validation', () => {
  async function fillSignup(user: ReturnType<typeof userEvent.setup>) {
    render(<WebAuth onLogin={vi.fn()}/>); await enterSignup(user);
    for (const [label, value] of [['Display name', 'Kaito'], ['Email address', 'hero@example.invalid'], ['Password', 'StrongPass1!'], ['Confirm password', 'StrongPass1!']])
      await user.type(screen.getByLabelText(label), value);
  }
  it('asks for no birthday and shows no age wording in sign-up', async () => {
    const user = userEvent.setup(); render(<WebAuth onLogin={vi.fn()}/>); await enterSignup(user);
    expect(screen.queryByLabelText('Birthday')).toBeNull();
    expect(screen.queryByRole('checkbox', {name: /birthday|permission|18/i})).toBeNull();
    expect(screen.queryByText(/birthday|child|under 12|ages 12/i)).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });
  it('does not create an account until the Terms box is ticked, and explains why', async () => {
    const user = userEvent.setup(); await fillSignup(user);
    await user.click(screen.getByRole('button', {name: 'BEGIN JOURNEY'}));
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(screen.getByText('Accept the Privacy Policy and Terms to continue.')).toBeInTheDocument();
  });
  it('sends the Terms version and no birthday or consent keys', async () => {
    const user = userEvent.setup(); await fillSignup(user);
    await user.click(screen.getByRole('checkbox', {name: 'I agree to the Privacy Policy & Terms'}));
    await user.click(screen.getByRole('button', {name: 'BEGIN JOURNEY'}));
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledOnce());
    const data = auth.signUp.mock.calls[0][0].options.data;
    expect(data).toEqual({display_name: 'Kaito', time_zone: expect.any(String), terms: {version: '2026-11-08-terms-v2'}});
    expect(data.birth_date).toBeUndefined(); expect(data.processing_consent).toBeUndefined();
  });
  it('forgets the Terms tick when the mode changes', async () => {
    const user = userEvent.setup(); await fillSignup(user);
    await user.click(screen.getByRole('checkbox', {name: 'I agree to the Privacy Policy & Terms'}));
    await user.click(screen.getByRole('button', {name: 'Sign in'})); await enterSignup(user);
    expect(screen.getByRole('checkbox', {name: 'I agree to the Privacy Policy & Terms'})).not.toBeChecked();
  });
  beforeEach(() => {
    auth.signInWithPassword.mockReset().mockResolvedValue({ error: null });
    auth.signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    auth.resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  });

  it('requests recovery with the explicit same-origin receiving page', async () => {
    const user = userEvent.setup(); render(<WebAuth onLogin={vi.fn()} />);
    await user.click(screen.getByRole('button', {name: 'Forgot password?'}));
    await user.type(screen.getByLabelText('Email address'), 'hero@example.invalid');
    await user.click(screen.getByRole('button', {name: 'SEND RECOVERY LINK'}));
    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('hero@example.invalid', {redirectTo: `${window.location.origin}/auth/recovery`}));
  });

  it('explains invalid email and short password after submit without calling Supabase', async () => {
    const user = userEvent.setup();
    render(<WebAuth onLogin={vi.fn()} />);
    await enterSignup(user);
    await user.type(screen.getByLabelText('Display name'), 'Kaito');
    await user.type(screen.getByLabelText('Email address'), 'bad-email');
    await user.type(screen.getByLabelText('Password'), 'abc');
    await user.type(screen.getByLabelText('Confirm password'), 'different');

    const submit = screen.getByRole('button', { name: 'BEGIN JOURNEY' });
    expect(submit).toBeEnabled();
    fireEvent.submit(submit.closest('form')!);
    expect(await screen.findByText('That does not look like a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 6 characters.')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(screen.queryByText('Okay')).not.toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('shows name, confirmation and consent errors, then submits once after correction', async () => {
    const user = userEvent.setup();
    render(<WebAuth onLogin={vi.fn()} />);
    await enterSignup(user);
    await user.type(screen.getByLabelText('Email address'), 'kaito@example.com');
    await user.type(screen.getByLabelText('Password'), 'StrongPass1!');
    await user.type(screen.getByLabelText('Confirm password'), 'wrong');
    fireEvent.submit(screen.getByRole('button', { name: 'BEGIN JOURNEY' }).closest('form')!);
    expect(await screen.findByText('Enter a display name.')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(screen.getByText('Accept the Privacy Policy and Terms to continue.')).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Display name'), 'Kaito');
    await user.clear(screen.getByLabelText('Confirm password'));
    await user.type(screen.getByLabelText('Confirm password'), 'StrongPass1!');
    await user.click(screen.getByRole('checkbox', { name: 'I agree to the Privacy Policy & Terms' }));
    await user.click(screen.getByRole('button', { name: 'BEGIN JOURNEY' }));
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledOnce());
  });

  it('clears attempted errors and password fields when switching auth mode', async () => {
    const user = userEvent.setup();
    render(<WebAuth onLogin={vi.fn()} />);
    await enterSignup(user);
    await user.type(screen.getByLabelText('Display name'), 'Kaito');
    await user.type(screen.getByLabelText('Email address'), 'bad-email');
    await user.type(screen.getByLabelText('Password'), 'abc');
    fireEvent.submit(screen.getByRole('button', { name: 'BEGIN JOURNEY' }).closest('form')!);
    expect(await screen.findByText('That does not look like a valid email address.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.queryByText('That does not look like a valid email address.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Confirm password')).toHaveValue('');
  });
});
