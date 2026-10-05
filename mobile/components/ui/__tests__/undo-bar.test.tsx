import { act, fireEvent, screen } from '@testing-library/react-native';
import { PALETTE_TOKENS } from '@eiyu/shared';

import { renderWithTheme } from '../test-theme';
import { UndoBar } from '../undo-bar';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = PALETTE_TOKENS.cyan.dark;
const advance = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); };
const press = async (name: string) => { await fireEvent.press(screen.getByRole('button', { name })); };

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('UndoBar', () => {
  it('shows its message and an Undo button', async () => {
    await renderWithTheme(<UndoBar message="Habit archived" onAction={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText('Habit archived')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeOnTheScreen();
  });

  it('announces the message politely, and keeps its buttons reachable', async () => {
    await renderWithTheme(<UndoBar message="Habit archived" onAction={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText('Habit archived')).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('has no Undo button when there is nothing to undo', async () => {
    await renderWithTheme(<UndoBar message="Saved" onDismiss={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('dismisses itself after 8 seconds, and not before', async () => {
    const onDismiss = jest.fn();
    await renderWithTheme(<UndoBar message="Archived" onAction={() => {}} onDismiss={onDismiss} />);
    await advance(7999);
    expect(onDismiss).not.toHaveBeenCalled();
    await advance(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('can be told to stay for a different time', async () => {
    const onDismiss = jest.fn();
    await renderWithTheme(<UndoBar message="Archived" durationMs={3000} onDismiss={onDismiss} />);
    await advance(3000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('runs the action and then dismisses', async () => {
    const calls: string[] = [];
    await renderWithTheme(<UndoBar message="Archived" onAction={() => { calls.push('action'); }} onDismiss={() => calls.push('dismiss')} />);
    await press('Undo');
    expect(calls).toEqual(['action', 'dismiss']);
  });

  it('waits for a slow action before dismissing, and ignores a second press meanwhile', async () => {
    let finish!: () => void;
    const onAction = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const onDismiss = jest.fn();
    await renderWithTheme(<UndoBar message="Archived" onAction={onAction} onDismiss={onDismiss} />);
    await press('Undo');
    await press('Undo');
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeBusy();
    await act(async () => { finish(); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('still dismisses when the action fails, leaving the caller to report it', async () => {
    const onDismiss = jest.fn();
    await renderWithTheme(<UndoBar message="Archived" onAction={async () => { throw new Error('offline'); }} onDismiss={onDismiss} />);
    await press('Undo');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('holds the countdown while a button is held down, then carries on with the time that was left', async () => {
    const onDismiss = jest.fn();
    await renderWithTheme(<UndoBar message="Archived" onAction={() => {}} onDismiss={onDismiss} />);
    await advance(5000);
    await fireEvent(screen.getByRole('button', { name: 'Undo' }), 'pressIn');
    await advance(20000);
    expect(onDismiss).not.toHaveBeenCalled();
    await fireEvent(screen.getByRole('button', { name: 'Undo' }), 'pressOut');
    await advance(2999);
    expect(onDismiss).not.toHaveBeenCalled();
    await advance(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('offers a second button and runs it before dismissing', async () => {
    const calls: string[] = [];
    await renderWithTheme(
      <UndoBar message="Habit archived" secondaryLabel="View archived" onSecondary={() => calls.push('secondary')} onDismiss={() => calls.push('dismiss')} />,
    );
    await press('View archived');
    expect(calls).toEqual(['secondary', 'dismiss']);
  });

  it('does not dismiss after it has gone away', async () => {
    const onDismiss = jest.fn();
    const view = await renderWithTheme(<UndoBar message="Archived" onDismiss={onDismiss} />);
    await view.unmount();
    await advance(20000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('is a flat warning-toned card from the palette', async () => {
    await renderWithTheme(<UndoBar message="Archived" onDismiss={() => {}} />);
    expect(screen.getByTestId('undo-bar')).toHaveStyle({ backgroundColor: T['panel-flat'], borderColor: T['warning-border'] });
  });
});
