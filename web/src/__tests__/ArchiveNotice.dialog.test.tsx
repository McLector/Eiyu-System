// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../store/session-context', () => ({ useSession: () => ({ user: { id: 'owner-a' } }) }));
import ArchiveNotice, { announceFeedback } from '../components/ArchiveNotice';
import Dialog from '../components/Dialog';

afterEach(cleanup);

it('shows a notice raised while a dialog is open inside that dialog, where it is reachable', async () => {
  render(<>
    <main><ArchiveNotice onOpen={vi.fn()} /></main>
    <Dialog title="Edit routine" onClose={vi.fn()}><button>Save routine</button></Dialog>
  </>);
  act(() => announceFeedback('Routine saved.', 'owner-a'));
  const dialog = screen.getByRole('dialog', { name: 'Edit routine' });
  const notice = await within(dialog).findByRole('status');
  expect(notice).toHaveTextContent('Routine saved.');
  // Everything outside the dialog is inert, so a notice outside it could never be dismissed.
  const dismiss = within(notice).getByRole('button', { name: 'Dismiss archive notice' });
  expect(dismiss.closest('[aria-hidden="true"]')).toBeNull();
  expect(screen.getByRole('main', { hidden: true }).closest('[aria-hidden="true"]')).not.toBeNull();
  dismiss.focus();
  expect(document.activeElement).toBe(dismiss);
});

it('uses the topmost dialog when dialogs are stacked', async () => {
  const view = render(<>
    <ArchiveNotice onOpen={vi.fn()} />
    <Dialog title="Outer" onClose={vi.fn()}><p>outer</p></Dialog>
  </>);
  view.rerender(<>
    <ArchiveNotice onOpen={vi.fn()} />
    <Dialog title="Outer" onClose={vi.fn()}><p>outer</p></Dialog>
    <Dialog title="Inner" onClose={vi.fn()}><p>inner</p></Dialog>
  </>);
  act(() => announceFeedback('Saved.', 'owner-a'));
  const inner = screen.getByRole('dialog', { name: 'Inner' });
  expect(await within(inner).findByRole('status')).toHaveTextContent('Saved.');
  const outer = screen.getByRole('dialog', { name: 'Outer', hidden: true });
  expect(within(outer).queryByRole('status', { hidden: true })).toBeNull();
});

it('marks every notice with a severity tone and defaults messages to success', () => {
  render(<ArchiveNotice onOpen={vi.fn()} />);
  act(() => announceFeedback('Routine saved.', 'owner-a'));
  expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'success');
  act(() => announceFeedback('Could not reach the System.', 'owner-a', 'danger'));
  expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'danger');
  expect(screen.getByRole('status')).toHaveClass('feedback-card');
});
