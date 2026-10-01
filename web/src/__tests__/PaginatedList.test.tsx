// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import PaginatedList from '../components/PaginatedList';
afterEach(cleanup);
it('reaches overflow items and clamps the page after removal', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<PaginatedList label="Exercises"><p>First</p><p>Second</p><p>Third</p></PaginatedList>);
  expect(screen.queryByText('Third')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next Exercises page' }));
  expect(screen.getByText('Third')).toBeInTheDocument();
  rerender(<PaginatedList label="Exercises"><p>First</p></PaginatedList>);
  expect(screen.getByText('First')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next Exercises page' })).toBeDisabled();
});
