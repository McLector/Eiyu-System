// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../store/eiyu-store', () => ({ useEiyu: () => ({
  user: { name: 'Yuki Tanaka', userClass: 'Ranger', rank: 'C' }, saveProfile: vi.fn(),
}) }));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ signOut: vi.fn() }) }));
vi.mock('../WebSettings', () => ({ default: () => null }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn() } } }));

import AccountShell from '../AccountShell';
import Landing from '../Landing';
import WebAuth from '../WebAuth';

const noop = vi.fn();

afterEach(cleanup);

describe('the logo mark carries the pulse class on every screen that shows it', () => {
  it('pulses the header mark in the account shell, and only the mark', () => {
    const { container } = render(<MemoryRouter initialEntries={['/board']}>
      <AccountShell overlay={null} onOpenOverlay={noop} onCloseOverlay={noop} darkMode onToggleDark={noop} palette="blue" onPaletteChange={noop} />
    </MemoryRouter>);
    const mark = screen.getByText('英');
    expect(mark).toHaveClass('brand-pulse');
    expect(mark.getAttribute('style') ?? '').not.toMatch(/animation/);
    expect(container.querySelectorAll('.brand-pulse')).toHaveLength(1);
    expect(screen.getByText('EIYU').closest('.brand-pulse')).toBeNull();
  });

  it('pulses the 34 px mark on the landing page, and only the mark', () => {
    const { container } = render(<Landing onGetStarted={noop} />);
    const mark = screen.getByText('英');
    expect(mark).toHaveClass('brand-pulse');
    expect(mark.getAttribute('style') ?? '').not.toMatch(/animation/);
    expect(container.querySelectorAll('.brand-pulse')).toHaveLength(1);
    const wordmarks = screen.getAllByText('EIYU SYSTEM');
    expect(wordmarks.length).toBeGreaterThan(0);
    for (const wordmark of wordmarks) expect(wordmark.closest('.brand-pulse')).toBeNull();
  });

  it('pulses the 56 px box that holds the sign-in logo, and only that box', () => {
    const { container } = render(<WebAuth onLogin={noop} />);
    const box = screen.getByText('英').parentElement;
    expect(box).toHaveClass('brand-pulse');
    expect(box?.getAttribute('style') ?? '').not.toMatch(/animation/);
    expect(container.querySelectorAll('.brand-pulse')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'EIYU SYSTEM' }).closest('.brand-pulse')).toBeNull();
  });
});
