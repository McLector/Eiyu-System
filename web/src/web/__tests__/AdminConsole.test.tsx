// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(), decide: vi.fn(), pause: vi.fn(), retention: vi.fn(), signOut: vi.fn(),
}));
vi.mock('@eiyu/shared', async importOriginal => ({
  ...await importOriginal<typeof import('@eiyu/shared')>(),
  listReviewRequests: (...a: unknown[]) => mocks.list(...a),
  decideReview: (...a: unknown[]) => mocks.decide(...a),
  pausePurpose: (...a: unknown[]) => mocks.pause(...a),
  listRetention: (...a: unknown[]) => mocks.retention(...a),
}));
vi.mock('../../store/session-context', () => ({ useSession: () => ({ signOut: mocks.signOut, user: { id: 'owner-a', email: 'admin@example.com' } }) }));
import AdminConsole from '../AdminConsole';

afterEach(cleanup);
const REQ = 'da230000-0000-4000-8000-0000000000aa';
const USER = 'da230000-0000-4000-8000-0000000000bb';
const row = { id: REQ, email: 'teen@example.com', ageBand: 'teen', purpose: 'custom-tracker', note: 'I am 16 and want this', createdAt: '2026-10-20T10:00:00Z' };
const ret = { email: 'gone@example.com', purpose: 'fitness-tracking', withdrawnAt: '2026-10-01T00:00:00Z', reminderDueOn: '2026-10-24', removalDueOn: '2026-10-31', status: 'reminded' };
beforeEach(() => {
  Object.values(mocks).forEach(fn => fn.mockReset());
  mocks.list.mockResolvedValue([row]); mocks.retention.mockResolvedValue([ret]);
  mocks.decide.mockResolvedValue(undefined); mocks.pause.mockResolvedValue(undefined); mocks.signOut.mockResolvedValue({ error: null });
});

describe('review queue', () => {
  it('lists only email, age band, purpose, note and date, and requests the open ones', async () => {
    const { container } = render(<AdminConsole userId="owner-a" />);
    const item = await screen.findByRole('article', { name: /teen@example.com/ });
    expect(mocks.list).toHaveBeenCalledWith('open', 'owner-a');
    expect(within(item).getByText('teen@example.com')).toBeInTheDocument();
    expect(within(item).getByText(/Age band: teen/)).toBeInTheDocument();
    expect(within(item).getByText(/Custom tracker/)).toBeInTheDocument();
    expect(within(item).getByText('I am 16 and want this')).toBeInTheDocument();
    expect(within(item).getByText(/Oct 20, 2026/)).toBeInTheDocument();
    expect(container.textContent).not.toContain(REQ);
  });
  it('says so when the queue is empty', async () => {
    mocks.list.mockResolvedValue([]);
    render(<AdminConsole userId="owner-a" />);
    expect(await screen.findByText(/no open requests/i)).toBeInTheDocument();
  });
  it('asks for confirmation before approving, and does nothing if cancelled', async () => {
    const user = userEvent.setup();
    render(<AdminConsole userId="owner-a" />);
    await user.click(await screen.findByRole('button', { name: /Approve request from teen@example.com/ }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/teen@example.com/);
    expect(mocks.decide).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('approves after confirming, then reloads the queue', async () => {
    const user = userEvent.setup();
    render(<AdminConsole userId="owner-a" />);
    await user.click(await screen.findByRole('button', { name: /Approve request from teen@example.com/ }));
    mocks.list.mockResolvedValue([]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm approve' }));
    await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith(REQ, 'approved', 'owner-a'));
    expect(await screen.findByText(/no open requests/i)).toBeInTheDocument();
  });
  it('denies after confirming', async () => {
    const user = userEvent.setup();
    render(<AdminConsole userId="owner-a" />);
    await user.click(await screen.findByRole('button', { name: /Deny request from teen@example.com/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm deny' }));
    await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith(REQ, 'denied', 'owner-a'));
  });
  it('shows a safe, focused error when the decision fails and keeps the request', async () => {
    mocks.decide.mockRejectedValue(new Error('Operator action unavailable.'));
    const user = userEvent.setup();
    render(<AdminConsole userId="owner-a" />);
    await user.click(await screen.findByRole('button', { name: /Approve request from teen@example.com/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm approve' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveFocus();
    expect(screen.getByRole('article', { name: /teen@example.com/ })).toBeInTheDocument();
  });
  it('shows a safe error when the queue cannot be loaded', async () => {
    mocks.list.mockRejectedValue(new Error('x'));
    render(<AdminConsole userId="owner-a" />);
    expect(await screen.findByText(/could not load the review queue/i)).toBeInTheDocument();
  });
});

describe('dispute pause', () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, id: string) {
    await user.type(await screen.findByLabelText(/account email or id/i), id);
    await user.selectOptions(screen.getByLabelText(/purpose/i), 'weekly-debrief');
  }
  it('pauses by email, and the confirmation names the account', async () => {
    const user = userEvent.setup();
    render(<AdminConsole userId="owner-a" />);
    await fill(user, '  teen@example.com ');
    await user.click(screen.getByRole('button', { name: 'Pause purpose' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/teen@example.com/);
    expect(mocks.pause).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Confirm pause' }));
    await waitFor(() => expect(mocks.pause).toHaveBeenCalledWith('teen@example.com', 'weekly-debrief', 'dispute', 'owner-a'));
    expect(await screen.findByRole('status')).toHaveTextContent(/paused/i);
    expect(screen.getByLabelText(/account email or id/i)).toHaveValue('');
  });
  it('pauses one purpose for one account after confirmation', async () => {
    const user = userEvent.setup();
    render(<AdminConsole userId="owner-a" />);
    await fill(user, USER);
    await user.click(screen.getByRole('button', { name: 'Pause purpose' }));
    expect(mocks.pause).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm pause' }));
    await waitFor(() => expect(mocks.pause).toHaveBeenCalledWith(USER, 'weekly-debrief', 'dispute', 'owner-a'));
    expect(await screen.findByRole('status')).toHaveTextContent(/paused/i);
  });
  it('rejects anything that is neither an email nor an id before any confirmation', async () => {
    const user = userEvent.setup();
    render(<AdminConsole userId="owner-a" />);
    await fill(user, 'not an account');
    await user.click(screen.getByRole('button', { name: 'Pause purpose' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent(/email address or account id/i);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.pause).not.toHaveBeenCalled();
  });
  it('shows a safe error when the pause fails', async () => {
    mocks.pause.mockRejectedValue(new Error('x'));
    const user = userEvent.setup();
    render(<AdminConsole userId="owner-a" />);
    await fill(user, USER);
    await user.click(screen.getByRole('button', { name: 'Pause purpose' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm pause' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not pause/i);
  });
});

describe('retention list and sign out', () => {
  it('shows email, purpose, dates and status only', async () => {
    render(<AdminConsole userId="owner-a" />);
    const table = await screen.findByRole('table', { name: /retention/i });
    const cells = within(table).getAllByRole('cell').map(c => c.textContent);
    expect(cells).toEqual(expect.arrayContaining(['gone@example.com', 'Fitness tracking', 'reminded']));
    expect(table).toHaveTextContent(/Oct 31, 2026/);
  });
  it('says so when nothing is waiting', async () => {
    mocks.retention.mockResolvedValue([]);
    render(<AdminConsole userId="owner-a" />);
    expect(await screen.findByText(/nothing is waiting for removal/i)).toBeInTheDocument();
  });
  it('shows a safe error when the list cannot be loaded', async () => {
    mocks.retention.mockRejectedValue(new Error('x'));
    render(<AdminConsole userId="owner-a" />);
    expect(await screen.findByText(/could not load the retention list/i)).toBeInTheDocument();
  });
  it('signs out', async () => {
    const user = userEvent.setup();
    render(<AdminConsole userId="owner-a" />);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(mocks.signOut).toHaveBeenCalled();
  });
});
