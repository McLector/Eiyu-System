// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import StateBlock from '../components/StateBlock';

afterEach(cleanup);

it('announces loading politely as a status region', () => {
  render(<StateBlock kind="loading">Reading the board…</StateBlock>);
  const block = screen.getByRole('status');
  expect(block).toHaveTextContent('Reading the board…');
  expect(block).toHaveClass('state-block', 'is-loading');
});

it('raises errors as alerts with a retry action that runs once per press', () => {
  const retry = vi.fn();
  render(<StateBlock kind="error" onRetry={retry}>The System could not reach the board.</StateBlock>);
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('The System could not reach the board.');
  expect(alert).toHaveClass('is-error');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledOnce();
});

it('lets a screen name its own retry label', () => {
  render(<StateBlock kind="error" onRetry={vi.fn()} retryLabel="Retry refresh">Refresh failed.</StateBlock>);
  expect(screen.getByRole('button', { name: 'Retry refresh' })).toBeInTheDocument();
});

it('renders an empty state with no live region and no retry button', () => {
  render(<StateBlock kind="empty" title="No long quests">Create a multi-stage quest.</StateBlock>);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText('No long quests')).toBeInTheDocument();
});

it('never offers retry on a loading block even if a handler is passed', () => {
  render(<StateBlock kind="loading" onRetry={vi.fn()}>Reading…</StateBlock>);
  expect(screen.queryByRole('button')).toBeNull();
});
