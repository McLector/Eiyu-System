// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signUp: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn() } } }));
import WebAuth from '../WebAuth';

afterEach(cleanup);

// Spacing lives in classes so a short window can tighten it: an inline value would beat the media query.
const SPACING = /^(padding|margin|gap|width|height)/;
const inlineSpacing = (el: Element | null) => Array.from((el as HTMLElement | null)?.style ?? []).filter(property => SPACING.test(property));

describe('WebAuth layout hooks', () => {
  it('exposes the page, brand, mark, card and form as classes with no inline spacing', () => {
    const { container } = render(<WebAuth onLogin={vi.fn()} />);
    for (const selector of ['.auth-page', '.auth-brand', '.auth-mark', '.auth-card', '.auth-accent-line', '.auth-form', '.auth-switch']) {
      const el = container.querySelector(selector);
      expect(el, selector).not.toBeNull();
      expect(inlineSpacing(el), selector).toEqual([]);
    }
  });
  it('keeps the brand pulse on the mark', () => {
    const { container } = render(<WebAuth onLogin={vi.fn()} />);
    expect(container.querySelector('.auth-mark')).toHaveClass('brand-pulse');
  });
  it('labels every field with the shared auth label in sign-up', async () => {
    const { container } = render(<WebAuth onLogin={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    const labels = Array.from(container.querySelectorAll('.auth-label')).map(el => el.textContent);
    expect(labels).toEqual(['DISPLAY NAME', 'EMAIL', 'PASSWORD', 'CONFIRM PASSWORD']);
    for (const label of container.querySelectorAll('.auth-label')) expect(inlineSpacing(label)).toEqual([]);
  });
  it('uses the same layout classes in forgot-password mode', async () => {
    const { container } = render(<WebAuth onLogin={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(container.querySelector('.auth-form')).not.toBeNull();
    expect(Array.from(container.querySelectorAll('.auth-label')).map(el => el.textContent)).toEqual(['EMAIL']);
  });
  it('still shows the title and the mode line', () => {
    render(<WebAuth onLogin={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'EIYU SYSTEM' })).toBeInTheDocument();
    expect(screen.getByText('Enter the system')).toBeInTheDocument();
  });
});
