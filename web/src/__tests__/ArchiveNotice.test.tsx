// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const account = vi.hoisted(() => ({ id: 'owner-a' }));
vi.mock('../store/session-context', () => ({ useSession: () => ({ user: { id: account.id } }) }));
import ArchiveNotice, { announceArchive, announceFeedback, NOTICE_FADE_MS } from '../components/ArchiveNotice';
beforeEach(() => { vi.useFakeTimers(); account.id = 'owner-a'; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
it('restarts repeated success events and fades out after eight seconds', () => {
  render(<ArchiveNotice onOpen={vi.fn()} />);
  act(() => announceArchive('habit', 'owner-a'));
  tick(7000); act(() => announceArchive('habit', 'owner-a')); tick(7000);
  expect(screen.getByRole('status')).toHaveTextContent('Habit archived');
  tick(1000); expect(screen.getByRole('status')).toHaveClass('is-leaving');
  tick(NOTICE_FADE_MS); expect(screen.queryByRole('status')).toBeNull();
});
it('has no dismiss button: the notice passes on its own', () => {
  render(<ArchiveNotice onOpen={vi.fn()} />);
  act(() => announceArchive('habit', 'owner-a'));
  expect(screen.queryByRole('button', { name: 'Dismiss archive notice' })).toBeNull();
  expect(screen.getByRole('status')).not.toHaveTextContent('×');
});
it('gives a plain feedback message no controls at all', () => {
  render(<ArchiveNotice onOpen={vi.fn()} />);
  act(() => announceFeedback('Routine saved.', 'owner-a'));
  expect(screen.getByRole('status')).toHaveTextContent('Routine saved.');
  expect(screen.queryByRole('button')).toBeNull();
});
it('fades before it leaves the page instead of vanishing', () => {
  render(<ArchiveNotice onOpen={vi.fn()} />);
  act(() => announceArchive('habit', 'owner-a'));
  tick(7999); expect(screen.getByRole('status')).not.toHaveClass('is-leaving');
  tick(1); expect(screen.getByRole('status')).toHaveClass('is-leaving');
  tick(NOTICE_FADE_MS - 1); expect(screen.getByRole('status')).toBeInTheDocument();
  tick(1); expect(screen.queryByRole('status')).toBeNull();
});
it('does not hold a fading notice open when the pointer or focus lands on it', () => {
  render(<ArchiveNotice onOpen={vi.fn()} />);
  act(() => announceArchive('habit', 'owner-a')); tick(8000);
  const notice = screen.getByRole('status');
  expect(notice).toHaveClass('is-leaving');
  fireEvent.mouseEnter(notice); fireEvent.focus(screen.getByRole('button', { name: 'View archived habits' }));
  tick(NOTICE_FADE_MS); expect(screen.queryByRole('status')).toBeNull();
});
it('holds the timer while either hover or keyboard focus remains', () => {
  render(<ArchiveNotice onOpen={vi.fn()} />);
  act(() => announceArchive('habit', 'owner-a')); tick(1000);
  const notice = screen.getByRole('status'), button = screen.getByRole('button', { name: 'View archived habits' });
  fireEvent.mouseEnter(notice); fireEvent.focus(button); fireEvent.mouseLeave(notice); tick(20000);
  expect(notice).toBeInTheDocument(); expect(notice).not.toHaveClass('is-leaving'); fireEvent.blur(button); tick(6999);
  expect(notice).not.toHaveClass('is-leaving'); tick(1); expect(notice).toHaveClass('is-leaving');
  tick(NOTICE_FADE_MS); expect(screen.queryByRole('status')).toBeNull();
});
it('shows the latest feedback immediately instead of queueing it behind stale feedback', () => {
  render(<ArchiveNotice onOpen={vi.fn()} />);
  act(() => announceFeedback('Exercise saved.', 'owner-a')); tick(1000);
  act(() => announceFeedback('Routine saved.', 'owner-a'));
  act(() => announceFeedback('Workout completed. Progress saved.', 'owner-a'));
  expect(screen.getByRole('status')).toHaveTextContent('Workout completed. Progress saved.');
  expect(screen.queryByText('Exercise saved.')).toBeNull();
  tick(8000); tick(NOTICE_FADE_MS); expect(screen.queryByRole('status')).toBeNull();
});
it('does not lose feedback that replaces a notice while it is fading', () => {
  render(<ArchiveNotice onOpen={vi.fn()} />);
  act(() => announceFeedback('Exercise saved.', 'owner-a')); tick(8000);
  expect(screen.getByRole('status')).toHaveClass('is-leaving');
  act(() => announceFeedback('Routine saved.', 'owner-a'));
  tick(NOTICE_FADE_MS);
  expect(screen.getByRole('status')).toHaveTextContent('Routine saved.');
  expect(screen.getByRole('status')).not.toHaveClass('is-leaving');
});
it('does not discard a waiting archive notice that carries an action', () => {
  render(<ArchiveNotice onOpen={vi.fn()} />);
  act(() => announceFeedback('Exercise saved.', 'owner-a'));
  act(() => announceArchive('habit', 'owner-a'));
  act(() => announceFeedback('Workout completed. Progress saved.', 'owner-a'));
  expect(screen.getByRole('status')).toHaveTextContent('Workout completed. Progress saved.');
  tick(8000); tick(NOTICE_FADE_MS);
  expect(screen.getByRole('status')).toHaveTextContent('Habit archived');
  expect(screen.getByRole('status')).not.toHaveClass('is-leaving');
  expect(screen.getByRole('button', { name: 'View archived habits' })).toBeInTheDocument();
});
it('drops queued events and late responses from the previous account', () => {
  const view = render(<ArchiveNotice onOpen={vi.fn()} />);
  act(() => announceArchive('habit', 'owner-a'));
  account.id = 'owner-b'; view.rerender(<ArchiveNotice onOpen={vi.fn()} />);
  expect(screen.queryByRole('status')).toBeNull();
  act(() => announceArchive('habit', 'owner-a')); expect(screen.queryByRole('status')).toBeNull();
  act(() => announceArchive('habit', 'owner-b'));
  expect(screen.getByRole('status')).toHaveTextContent('Habit archived');
  tick(8000); tick(NOTICE_FADE_MS); expect(screen.queryByRole('status')).toBeNull();
});
