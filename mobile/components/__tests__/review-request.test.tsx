import {act, screen, userEvent, waitFor} from '@testing-library/react-native';
import {OperatorError} from '@eiyu/shared';
import {renderWithTheme} from '../ui/test-theme';
import {ReviewRequest} from '../status/review-request';

const mockRequest = jest.fn();
const mockCancel = jest.fn();
const mockMine = jest.fn();
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  requestAuthorityReview: (...args: unknown[]) => mockRequest(...args),
  cancelAuthorityReview: (...args: unknown[]) => mockCancel(...args),
  fetchMyReviewRequests: (...args: unknown[]) => mockMine(...args),
}));
beforeEach(() => {
  mockRequest.mockReset().mockResolvedValue(undefined);
  mockCancel.mockReset().mockResolvedValue(undefined);
  mockMine.mockReset().mockResolvedValue([]);
});
const mine = (purpose: string, status: string) => ({requestId: 'r', purpose, status, createdAt: '2026-10-24T10:00:00Z'});

describe('ReviewRequest after a reload (native)', () => {
  it('reads this owner\'s requests and restores an open one so it can be cancelled', async () => {
    mockMine.mockResolvedValue([mine('custom-tracker', 'open')]);
    await renderWithTheme(<ReviewRequest userId="owner-a" purpose="custom-tracker"/>);
    expect(await screen.findByText(/already requested/i)).toBeOnTheScreen();
    expect(mockMine).toHaveBeenCalledWith('owner-a');
    expect(screen.getByRole('button', {name: 'Cancel review request'})).toBeOnTheScreen();
    expect(screen.queryByRole('button', {name: 'Request review'})).toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('cancels a restored request and returns to the first button', async () => {
    mockMine.mockResolvedValue([mine('custom-tracker', 'open')]);
    const user = userEvent.setup();
    await renderWithTheme(<ReviewRequest userId="owner-a" purpose="custom-tracker"/>);
    await user.press(await screen.findByRole('button', {name: 'Cancel review request'}));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('custom-tracker', 'owner-a'));
    expect(await screen.findByRole('button', {name: 'Request review'})).toBeOnTheScreen();
  });

  it.each([
    ['another purpose', mine('fitness-tracking', 'open')],
    ['a denied request', mine('custom-tracker', 'denied')],
    ['an approved request', mine('custom-tracker', 'approved')],
  ])('keeps the first button for %s', async (_name, row) => {
    mockMine.mockResolvedValue([row]);
    await renderWithTheme(<ReviewRequest userId="owner-a" purpose="custom-tracker"/>);
    await waitFor(() => expect(mockMine).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('button', {name: 'Request review'})).toBeOnTheScreen();
    expect(screen.queryByText(/already requested/i)).toBeNull();
  });

  it('keeps the first button, with no error, when the read fails', async () => {
    mockMine.mockRejectedValue(new OperatorError());
    await renderWithTheme(<ReviewRequest userId="owner-a" purpose="custom-tracker"/>);
    await waitFor(() => expect(mockMine).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('button', {name: 'Request review'})).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not close a form the person already opened when the read lands late', async () => {
    let land: (rows: unknown[]) => void = () => undefined;
    mockMine.mockReturnValue(new Promise(resolve => { land = resolve; }));
    const user = userEvent.setup();
    await renderWithTheme(<ReviewRequest userId="owner-a" purpose="custom-tracker"/>);
    await user.press(screen.getByRole('button', {name: 'Request review'}));
    await act(async () => { land([mine('custom-tracker', 'open')]); });
    expect(screen.getByLabelText('Note (optional)')).toBeOnTheScreen();
  });
});

const open = async (user: ReturnType<typeof userEvent.setup>, purpose: 'custom-tracker' | 'fitness-tracking' | 'weekly-debrief' = 'custom-tracker') => {
  await renderWithTheme(<ReviewRequest userId="owner-a" purpose={purpose}/>);
  await user.press(screen.getByRole('button', {name: 'Request review'}));
};
const send = async (user: ReturnType<typeof userEvent.setup>) => { await user.press(screen.getByRole('button', {name: 'Send request'})); };

describe('ReviewRequest (native)', () => {
  it('shows only a button at first and calls nothing on mount', async () => {
    await renderWithTheme(<ReviewRequest userId="owner-a" purpose="custom-tracker"/>);
    expect(screen.getByRole('button', {name: 'Request review'})).toBeOnTheScreen();
    expect(screen.queryByLabelText(/note/i)).toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('opens a note field with the no-documents hint and a 280 limit', async () => {
    const user = userEvent.setup(); await open(user);
    const note = screen.getByLabelText('Note (optional)');
    expect(note.props.maxLength).toBe(280);
    expect(screen.getByText("Don't include IDs or documents")).toBeOnTheScreen();
  });

  it('sends the purpose and note for this owner, then offers to cancel', async () => {
    const user = userEvent.setup(); await open(user, 'weekly-debrief');
    await user.type(screen.getByLabelText('Note (optional)'), 'I am 16');
    await send(user);
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('weekly-debrief', 'I am 16', 'owner-a'));
    expect(await screen.findByText(/review requested/i)).toBeOnTheScreen();
    expect(screen.getByRole('button', {name: 'Cancel review request'})).toBeOnTheScreen();
  });

  it('sends with an empty note', async () => {
    const user = userEvent.setup(); await open(user, 'fitness-tracking'); await send(user);
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('fitness-tracking', '', 'owner-a'));
  });

  it('cancels its own request and returns to the first button', async () => {
    const user = userEvent.setup(); await open(user); await send(user);
    await user.press(await screen.findByRole('button', {name: 'Cancel review request'}));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('custom-tracker', 'owner-a'));
    expect(await screen.findByRole('button', {name: 'Request review'})).toBeOnTheScreen();
  });

  it('shows a safe error and keeps the form open for an unknown failure', async () => {
    mockRequest.mockRejectedValue(new Error('Operator action unavailable.'));
    const user = userEvent.setup(); await open(user); await send(user);
    expect(await screen.findByText('We could not send your request. Try again later.')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.queryByText(/Operator action unavailable/)).toBeNull();
    expect(screen.getByRole('button', {name: 'Send request'})).toBeEnabled();
  });

  it('treats an already-open request as sent, so it can be cancelled', async () => {
    mockRequest.mockRejectedValue(new OperatorError('already-open'));
    const user = userEvent.setup(); await open(user); await send(user);
    expect(await screen.findByText(/already requested/i)).toBeOnTheScreen();
    expect(screen.getByRole('button', {name: 'Cancel review request'})).toBeOnTheScreen();
  });

  it.each([
    ['limit', /tomorrow/i],
    ['not-needed', /no review is needed/i],
    ['denied', /could not send/i],
    ['unavailable', /could not send/i],
  ] as const)('explains a %s refusal', async (kind, message) => {
    mockRequest.mockRejectedValue(new OperatorError(kind));
    const user = userEvent.setup(); await open(user); await send(user);
    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(screen.getByRole('button', {name: 'Send request'})).toBeOnTheScreen();
  });

  it('shows a safe error when cancelling fails and keeps the cancel button', async () => {
    mockCancel.mockRejectedValue(new Error('x'));
    const user = userEvent.setup(); await open(user); await send(user);
    await user.press(await screen.findByRole('button', {name: 'Cancel review request'}));
    expect(await screen.findByText(/could not cancel/i)).toBeOnTheScreen();
    expect(screen.getByRole('button', {name: 'Cancel review request'})).toBeOnTheScreen();
  });

  it('does not send twice while saving', async () => {
    let release: () => void = () => undefined;
    mockRequest.mockReturnValue(new Promise<void>(r => { release = r; }));
    const user = userEvent.setup(); await open(user); await send(user);
    expect(screen.getByRole('button', {name: /sending/i})).toBeDisabled();
    await user.press(screen.getByRole('button', {name: /sending/i}));
    await act(async () => { release(); });
    await screen.findByText(/review requested/i);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('closes the form without sending when the person backs out', async () => {
    const user = userEvent.setup(); await open(user);
    await user.press(screen.getByRole('button', {name: 'Not now'}));
    expect(mockRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('button', {name: 'Request review'})).toBeOnTheScreen();
  });
});
