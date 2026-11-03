import {screen, waitFor} from '@testing-library/react-native';
import {renderWithTheme, TestThemeProvider} from '../ui/test-theme';
import {RetentionNotice} from '../eiyu/retention-notice';

const mockFetch = jest.fn();
jest.mock('@eiyu/shared', () => ({
  ...jest.requireActual('@eiyu/shared'),
  fetchRetentionNotice: (...args: unknown[]) => mockFetch(...args),
}));
beforeEach(() => mockFetch.mockReset());

describe('RetentionNotice (native)', () => {
  it('names the removal date and how to stop it when a reminder is due', async () => {
    mockFetch.mockResolvedValue([{purpose: 'custom-tracker', removalDueOn: '2026-10-31', reminded: true}]);
    await renderWithTheme(<RetentionNotice userId="owner-a"/>);
    expect(await screen.findByText('Your custom quest records will be removed on October 31, 2026 unless you turn custom tracking back on.')).toBeOnTheScreen();
    expect(mockFetch).toHaveBeenCalledWith('owner-a');
  });
  it('words the fitness purpose for Gym records', async () => {
    mockFetch.mockResolvedValue([{purpose: 'fitness-tracking', removalDueOn: '2026-11-02', reminded: true}]);
    await renderWithTheme(<RetentionNotice userId="owner-a"/>);
    expect(await screen.findByText('Your Gym records will be removed on November 2, 2026 unless you turn fitness tracking back on.')).toBeOnTheScreen();
  });
  it('shows one line per due purpose', async () => {
    mockFetch.mockResolvedValue([
      {purpose: 'custom-tracker', removalDueOn: '2026-10-31', reminded: true},
      {purpose: 'fitness-tracking', removalDueOn: '2026-11-02', reminded: true},
    ]);
    await renderWithTheme(<RetentionNotice userId="owner-a"/>);
    await waitFor(() => expect(screen.getAllByText(/will be removed on/)).toHaveLength(2));
  });
  it('shows nothing before the reminder is due', async () => {
    mockFetch.mockResolvedValue([{purpose: 'custom-tracker', removalDueOn: '2026-10-31', reminded: false}]);
    await renderWithTheme(<RetentionNotice userId="owner-a"/>);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.queryByText(/will be removed/)).toBeNull();
  });
  it('shows nothing when there is no notice or the read fails', async () => {
    mockFetch.mockResolvedValueOnce([]);
    const first = await renderWithTheme(<RetentionNotice userId="owner-a"/>);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/will be removed/)).toBeNull();
    await first.unmount();
    mockFetch.mockRejectedValueOnce(new Error('x'));
    await renderWithTheme(<RetentionNotice userId="owner-a"/>);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/will be removed/)).toBeNull();
  });
  it('ignores a late answer for a previous owner', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockFetch.mockReturnValueOnce(new Promise(r => { resolve = r; })).mockResolvedValue([]);
    const view = await renderWithTheme(<RetentionNotice userId="owner-a"/>);
    await view.rerender(<TestThemeProvider><RetentionNotice userId="owner-b"/></TestThemeProvider>);
    resolve([{purpose: 'custom-tracker', removalDueOn: '2026-10-31', reminded: true}]);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/will be removed/)).toBeNull();
  });
});
