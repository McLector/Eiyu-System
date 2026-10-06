import { act, screen, userEvent } from '@testing-library/react-native';

import { renderWithTheme, TestThemeProvider } from '../../ui/test-theme';
import { SyncNotice } from '../sync-notice';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Props = React.ComponentProps<typeof SyncNotice>;
const base: Props = { waiting: 0, failed: 0, offline: false, onReview: () => {} };
const show = (extra: Partial<Props> = {}) => {
  const props = { ...base, onReview: jest.fn(), ...extra };
  return renderWithTheme(<SyncNotice {...props} />).then(() => props);
};

describe('SyncNotice', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('renders nothing when there is nothing to report', async () => {
    await show();
    expect(screen.queryByTestId('sync-notice')).toBeNull();
  });

  it('counts changes waiting to sync, singular and plural', async () => {
    await show({ waiting: 1 });
    expect(screen.getByText('1 change waiting to sync')).toBeOnTheScreen();
    await show({ waiting: 3 });
    expect(screen.getByText('3 changes waiting to sync')).toBeOnTheScreen();
  });

  it('says they will send on reconnect only while offline', async () => {
    await show({ waiting: 2, offline: false });
    expect(screen.queryByText(/offline/i)).toBeNull();
    await show({ waiting: 2, offline: true });
    expect(screen.getByText("You're offline. They will send when you reconnect.")).toBeOnTheScreen();
  });

  it('announces itself politely so a screen reader hears the count change', async () => {
    await show({ waiting: 2 });
    expect(screen.getByTestId('sync-notice').props.accessibilityLiveRegion).toBe('polite');
  });

  it('reports changes that were not saved with a Review button', async () => {
    const props = await show({ failed: 2 });
    expect(screen.getByText('2 changes not saved')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Review changes that were not saved' }));
    expect(props.onReview).toHaveBeenCalledTimes(1);
  });

  it('uses an alert for failures so they are announced at once', async () => {
    await show({ failed: 1 });
    expect(screen.getByText('1 change not saved')).toBeOnTheScreen();
    expect(screen.getByTestId('sync-notice').props.accessibilityRole).toBe('alert');
  });

  it('shows waiting and failed together without hiding either', async () => {
    await show({ waiting: 1, failed: 1 });
    expect(screen.getByText('1 change waiting to sync')).toBeOnTheScreen();
    expect(screen.getByText('1 change not saved')).toBeOnTheScreen();
  });

  it('flashes Synced for two seconds once the last waiting change lands, then disappears', async () => {
    jest.useFakeTimers();
    const props = { ...base, onReview: jest.fn() };
    const view = await renderWithTheme(<SyncNotice {...props} waiting={2} />);
    await view.rerender(<TestThemeProvider><SyncNotice {...props} waiting={0} /></TestThemeProvider>);
    expect(screen.getByText('Synced')).toBeOnTheScreen();
    await act(async () => { jest.advanceTimersByTime(2100); });
    expect(screen.queryByText('Synced')).toBeNull();
    expect(screen.queryByTestId('sync-notice')).toBeNull();
  });

  it('does not say Synced when the queue emptied because something failed instead', async () => {
    jest.useFakeTimers();
    const props = { ...base, onReview: jest.fn() };
    const view = await renderWithTheme(<SyncNotice {...props} waiting={1} />);
    await view.rerender(<TestThemeProvider><SyncNotice {...props} waiting={0} failed={1} /></TestThemeProvider>);
    expect(screen.queryByText('Synced')).toBeNull();
    expect(screen.getByText('1 change not saved')).toBeOnTheScreen();
    // Dismissing the failure is not a sync either.
    await view.rerender(<TestThemeProvider><SyncNotice {...props} waiting={0} failed={0} /></TestThemeProvider>);
    expect(screen.queryByText('Synced')).toBeNull();
    expect(screen.queryByTestId('sync-notice')).toBeNull();
  });

  it('does not say Synced on first render with nothing waiting', async () => {
    await show({ waiting: 0 });
    expect(screen.queryByText('Synced')).toBeNull();
  });
});
