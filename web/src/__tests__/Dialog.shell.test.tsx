// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import Dialog from '../components/Dialog';

afterEach(cleanup);

describe('Dialog shell', () => {
  it('puts an accent rule between the heading and the body', () => {
    render(<Dialog title="New quest" onClose={() => undefined}><p>Body</p></Dialog>);
    const dialog = screen.getByRole('dialog', { name: 'New quest' });
    const heading = dialog.querySelector('.phase4-dialog-heading')!;
    const rule = dialog.querySelector('.dialog-rule')!;
    const body = dialog.querySelector('.compact-dialog-body')!;
    expect(rule).toHaveAttribute('aria-hidden', 'true');
    expect(heading.nextElementSibling).toBe(rule);
    expect(rule.nextElementSibling).toBe(body);
    expect(body).toHaveTextContent('Body');
  });
});
