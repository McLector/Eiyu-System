// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import StatChip from '../components/StatChip';

afterEach(cleanup);

it('tells assistive tech which stat is selected', () => {
  const { rerender } = render(<StatChip stat="INT" selected={false} onClick={() => {}} />);
  expect(screen.getByRole('button', { name: 'INT' })).toHaveAttribute('aria-pressed', 'false');
  rerender(<StatChip stat="INT" selected onClick={() => {}} />);
  expect(screen.getByRole('button', { name: 'INT' })).toHaveAttribute('aria-pressed', 'true');
});

it('selects on click and ignores clicks while disabled', async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  const { rerender } = render(<StatChip stat="WIS" selected={false} onClick={onClick} />);
  await user.click(screen.getByRole('button', { name: 'WIS' }));
  expect(onClick).toHaveBeenCalledTimes(1);
  rerender(<StatChip stat="WIS" selected={false} onClick={onClick} disabled />);
  await user.click(screen.getByRole('button', { name: 'WIS' }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('keeps the stat label at a legible size and shows the stat icon', () => {
  const { container } = render(<StatChip stat="STR" selected onClick={() => {}} />);
  expect(container.querySelector('svg')).not.toBeNull();
  const label = screen.getByText('STR');
  expect(parseFloat(label.style.fontSize)).toBeGreaterThanOrEqual(11);
});
