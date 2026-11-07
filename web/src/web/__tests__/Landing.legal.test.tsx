// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';

import Landing from '../Landing';

afterEach(cleanup);

it('links the Privacy Policy and Terms of Use from the footer as plain page links', () => {
  render(<Landing onGetStarted={vi.fn()} />);
  const footer = screen.getByRole('contentinfo');
  expect(within(footer).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  expect(within(footer).getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/terms');
});

it('opens neither document in a new tab', () => {
  render(<Landing onGetStarted={vi.fn()} />);
  for (const name of ['Privacy Policy', 'Terms of Use']) expect(screen.getByRole('link', { name })).not.toHaveAttribute('target');
});
