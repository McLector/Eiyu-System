// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn(), cancel: vi.fn(), mine: vi.fn() }));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<typeof import('@eiyu/shared')>(),
  requestAuthorityReview: (...args: unknown[]) => mocks.request(...args),
  cancelAuthorityReview: (...args: unknown[]) => mocks.cancel(...args),
  fetchMyReviewRequests: (...args: unknown[]) => mocks.mine(...args),
}));
import { OperatorError } from '@eiyu/shared';
import { ReviewRequest } from '../ReviewRequest';

afterEach(cleanup);
beforeEach(() => {
  mocks.request.mockReset().mockResolvedValue(undefined);
  mocks.cancel.mockReset().mockResolvedValue(undefined);
  mocks.mine.mockReset().mockResolvedValue([]);
});
const mine = (purpose: string, status: string) => ({ requestId: 'r', purpose, status, createdAt: '2026-10-24T10:00:00Z' });

describe('ReviewRequest after a reload', () => {
  it('reads this owner\'s requests and restores an open one so it can be cancelled', async () => {
    mocks.mine.mockResolvedValue([mine('custom-tracker', 'open')]);
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    expect(await screen.findByRole('status')).toHaveTextContent(/already requested/i);
    expect(mocks.mine).toHaveBeenCalledWith('owner-a');
    expect(screen.getByRole('button', { name: 'Cancel review request' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request review' })).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('cancels a restored request and returns to the first button', async () => {
    mocks.mine.mockResolvedValue([mine('custom-tracker', 'open')]);
    const user = userEvent.setup();
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    await user.click(await screen.findByRole('button', { name: 'Cancel review request' }));
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith('custom-tracker', 'owner-a'));
    expect(await screen.findByRole('button', { name: 'Request review' })).toBeInTheDocument();
  });

  it.each([
    ['another purpose', mine('fitness-tracking', 'open')],
    ['a denied request', mine('custom-tracker', 'denied')],
    ['an approved request', mine('custom-tracker', 'approved')],
  ])('keeps the first button for %s', async (_name, row) => {
    mocks.mine.mockResolvedValue([row]);
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    await waitFor(() => expect(mocks.mine).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('button', { name: 'Request review' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the first button, with no error, when the read fails', async () => {
    mocks.mine.mockRejectedValue(new OperatorError());
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    await waitFor(() => expect(mocks.mine).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('button', { name: 'Request review' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not close a form the person already opened when the read lands late', async () => {
    let land: (rows: unknown[]) => void = () => undefined;
    mocks.mine.mockReturnValue(new Promise(resolve => { land = resolve; }));
    const user = userEvent.setup();
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    await user.click(screen.getByRole('button', { name: 'Request review' }));
    await act(async () => { land([mine('custom-tracker', 'open')]); });
    expect(screen.getByRole('textbox', { name: /note/i })).toBeInTheDocument();
  });

  it('ignores a read from the previous account after switching', async () => {
    let land: (rows: unknown[]) => void = () => undefined;
    mocks.mine.mockReturnValueOnce(new Promise(resolve => { land = resolve; }));
    const { rerender } = render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    rerender(<ReviewRequest userId="owner-b" purpose="custom-tracker" />);
    await act(async () => { land([mine('custom-tracker', 'open')]); });
    expect(mocks.mine).toHaveBeenLastCalledWith('owner-b');
    expect(screen.getByRole('button', { name: 'Request review' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('ReviewRequest', () => {
  it('shows only a button at first and calls nothing on mount', () => {
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    expect(screen.getByRole('button', { name: 'Request review' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('opens a labelled note field with the no-documents hint and a 280 limit', async () => {
    const user = userEvent.setup();
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    await user.click(screen.getByRole('button', { name: 'Request review' }));
    const note = screen.getByRole('textbox', { name: /note/i });
    expect(note).toHaveFocus();
    expect(note).toHaveAttribute('maxlength', '280');
    expect(screen.getByText("Don't include IDs or documents")).toBeInTheDocument();
    expect(note).toHaveAccessibleDescription(/Don't include IDs or documents/);
  });

  it('sends the purpose and note for this owner, then offers to cancel', async () => {
    const user = userEvent.setup();
    render(<ReviewRequest userId="owner-a" purpose="weekly-debrief" />);
    await user.click(screen.getByRole('button', { name: 'Request review' }));
    await user.type(screen.getByRole('textbox', { name: /note/i }), 'I am 16');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('weekly-debrief', 'I am 16', 'owner-a'));
    expect(await screen.findByRole('status')).toHaveTextContent(/review requested/i);
    expect(screen.getByRole('button', { name: 'Cancel review request' })).toBeInTheDocument();
  });

  it('sends with an empty note', async () => {
    const user = userEvent.setup();
    render(<ReviewRequest userId="owner-a" purpose="fitness-tracking" />);
    await user.click(screen.getByRole('button', { name: 'Request review' }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('fitness-tracking', '', 'owner-a'));
  });

  it('cancels its own request and returns to the first button', async () => {
    const user = userEvent.setup();
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    await user.click(screen.getByRole('button', { name: 'Request review' }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel review request' }));
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith('custom-tracker', 'owner-a'));
    expect(await screen.findByRole('button', { name: 'Request review' })).toBeInTheDocument();
  });

  it('shows a safe error, moves focus to it, and keeps the form open', async () => {
    mocks.request.mockRejectedValue(new Error('Operator action unavailable.'));
    const user = userEvent.setup();
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    await user.click(screen.getByRole('button', { name: 'Request review' }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent(/could not send/i);
    expect(alert).not.toHaveTextContent('Operator action unavailable');
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled();
  });

  it('treats an already-open request as sent, so it can be cancelled', async () => {
    mocks.request.mockRejectedValue(new OperatorError('already-open'));
    const user = userEvent.setup();
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    await user.click(screen.getByRole('button', { name: 'Request review' }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/already requested/i);
    expect(screen.getByRole('button', { name: 'Cancel review request' })).toBeInTheDocument();
  });

  it('explains the daily limit', async () => {
    mocks.request.mockRejectedValue(new OperatorError('limit'));
    const user = userEvent.setup();
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    await user.click(screen.getByRole('button', { name: 'Request review' }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/tomorrow/i);
  });

  it('explains when no review is needed any more', async () => {
    mocks.request.mockRejectedValue(new OperatorError('not-needed'));
    const user = userEvent.setup();
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    await user.click(screen.getByRole('button', { name: 'Request review' }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no review is needed/i);
  });

  it('shows a safe error when cancelling fails and keeps the cancel button', async () => {
    mocks.cancel.mockRejectedValue(new Error('x'));
    const user = userEvent.setup();
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    await user.click(screen.getByRole('button', { name: 'Request review' }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel review request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not cancel/i);
    expect(screen.getByRole('button', { name: 'Cancel review request' })).toBeInTheDocument();
  });

  it('disables double sends while saving', async () => {
    let release: () => void = () => undefined;
    mocks.request.mockReturnValue(new Promise<void>(r => { release = r; }));
    const user = userEvent.setup();
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    await user.click(screen.getByRole('button', { name: 'Request review' }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
    release();
    await screen.findByRole('status');
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('closes the form without sending when the person backs out', async () => {
    const user = userEvent.setup();
    render(<ReviewRequest userId="owner-a" purpose="custom-tracker" />);
    await user.click(screen.getByRole('button', { name: 'Request review' }));
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(mocks.request).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Request review' })).toHaveFocus();
  });
});
