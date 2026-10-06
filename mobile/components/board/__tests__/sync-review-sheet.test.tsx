import { screen, userEvent } from '@testing-library/react-native';

import type { QueueEntry } from '@/lib/write-queue';
import { renderWithTheme } from '../../ui/test-theme';
import { SyncReviewSheet } from '../sync-review-sheet';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function failed(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'e1', userId: 'u', kind: 'complete', habitId: 'h1', accountDate: '2026-10-05', createdAt: 1, attempts: 1,
    status: 'failed', label: 'Morning run',
    failure: { reason: 'not-on-board', message: "Not saved: this quest is no longer on today's board." },
    ...overrides,
  };
}
const open = (entries: QueueEntry[], visible = true) => {
  const props = { visible, entries, onRetry: jest.fn(), onDismiss: jest.fn(), onClose: jest.fn() };
  return renderWithTheme(<SyncReviewSheet {...props} />).then(() => props);
};

describe('SyncReviewSheet', () => {
  it('shows nothing while hidden', async () => {
    await open([failed()], false);
    expect(screen.queryByText('NOT SAVED')).toBeNull();
  });

  it('lists each failed write with its quest, what it was and why it failed', async () => {
    await open([
      failed(),
      failed({ id: 'e2', kind: 'progress', delta: 2, base: 0, label: 'Drink water', failure: { reason: 'progress-changed', message: 'Not saved: the progress changed somewhere else.' } }),
    ]);
    expect(screen.getByText('NOT SAVED')).toBeOnTheScreen();
    expect(screen.getByText('Morning run')).toBeOnTheScreen();
    expect(screen.getByText('Complete')).toBeOnTheScreen();
    expect(screen.getByText("Not saved: this quest is no longer on today's board.")).toBeOnTheScreen();
    expect(screen.getByText('Drink water')).toBeOnTheScreen();
    expect(screen.getByText('Progress +2')).toBeOnTheScreen();
    expect(screen.getByText('Not saved: the progress changed somewhere else.')).toBeOnTheScreen();
  });

  it('falls back to a generic name when the quest name was not recorded', async () => {
    await open([failed({ label: undefined })]);
    expect(screen.getByText('A quest')).toBeOnTheScreen();
  });

  it('retries and dismisses a write by its id', async () => {
    const props = await open([failed(), failed({ id: 'e2', label: 'Read' })]);
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Retry Read' }));
    expect(props.onRetry).toHaveBeenCalledWith('e2');
    await user.press(screen.getByRole('button', { name: 'Dismiss Morning run' }));
    expect(props.onDismiss).toHaveBeenCalledWith('e1');
  });

  it('offers no Retry for a write whose day has passed, only Dismiss', async () => {
    await open([failed({ failure: { reason: 'day-passed', message: 'Not saved: the day ended while you were offline.' } })]);
    expect(screen.queryByRole('button', { name: 'Retry Morning run' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dismiss Morning run' })).toBeOnTheScreen();
  });

  it('closes from the sheet close control', async () => {
    const props = await open([failed()]);
    await userEvent.setup().press(screen.getByRole('button', { name: /close/i }));
    expect(props.onClose).toHaveBeenCalled();
  });
});
