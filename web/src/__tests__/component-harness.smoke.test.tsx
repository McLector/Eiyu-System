// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('web component test harness', () => {
  it('renders and interacts through the accessibility contract', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(<button onClick={onClick}>Harness probe</button>);
    const button = screen.getByRole('button', { name: 'Harness probe' });
    expect(button).toBeInTheDocument();
    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
