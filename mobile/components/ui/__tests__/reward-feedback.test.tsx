import { act, screen } from '@testing-library/react-native';
import { STAT_COLORS, type RewardReceipt } from '@eiyu/shared';

import { RewardFeedback } from '../reward-feedback';
import { renderWithTheme, TestThemeProvider } from '../test-theme';
import { useReducedMotion } from '../use-reduced-motion';

jest.mock('../use-reduced-motion', () => ({ useReducedMotion: jest.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const advance = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); };

function receipt(overrides: Partial<RewardReceipt> = {}): RewardReceipt {
  return {
    id: 'r1', stage_id: 's1', done: true, changed: true, replayed: false,
    components: [{ kind: 'stage', stat: 'INT', delta: 40 }],
    totals: [{ stat: 'INT', before: 90, after: 130, delta: 40 }],
    ...overrides,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});
afterEach(() => { jest.useRealTimers(); });

describe('RewardFeedback', () => {
  it('shows the stat, the XP gained and the level, counting up from where it was', async () => {
    await renderWithTheme(<RewardFeedback receipt={receipt()} />);
    expect(screen.getByText('INT +40 XP')).toBeOnTheScreen();
    expect(screen.getByText('Level 1 · 90 / 100 XP')).toBeOnTheScreen();
    await advance(600);
    expect(screen.getByText('Level 2 · 30 / 125 XP')).toBeOnTheScreen();
  });

  it('colours the stat line with the stat\'s own colour', async () => {
    await renderWithTheme(<RewardFeedback receipt={receipt()} />);
    expect(screen.getByText('INT +40 XP')).toHaveStyle({ color: STAT_COLORS.INT });
  });

  it('with reduced motion shows the final numbers at once', async () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    await renderWithTheme(<RewardFeedback receipt={receipt()} />);
    expect(screen.getByText('Level 2 · 30 / 125 XP')).toBeOnTheScreen();
  });

  it('says "Level up" only when a level was gained', async () => {
    await renderWithTheme(<RewardFeedback receipt={receipt()} />);
    expect(screen.getByText('Level up')).toBeOnTheScreen();
    await screen.rerender(
      <TestThemeProvider>
        <RewardFeedback receipt={receipt({ id: 'r2', totals: [{ stat: 'INT', before: 10, after: 40, delta: 30 }] })} />
      </TestThemeProvider>,
    );
    expect(screen.queryByText('Level up')).toBeNull();
  });

  it('shows a progress bar for the level', async () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    await renderWithTheme(<RewardFeedback receipt={receipt()} />);
    expect(screen.getByRole('progressbar', { name: 'INT level progress' })).toHaveProp('accessibilityValue', { min: 0, max: 125, now: 30 });
  });

  it('reads out the final result in one go, not the counting numbers', async () => {
    await renderWithTheme(<RewardFeedback receipt={receipt()} />);
    expect(screen.getByLabelText('Confirmed XP reward: INT plus 40 XP, level 2, 30 of 125 XP')).toHaveProp('accessibilityLiveRegion', 'polite');
  });

  it('lists every stat that changed', async () => {
    await renderWithTheme(
      <RewardFeedback
        receipt={receipt({
          totals: [{ stat: 'INT', before: 0, after: 20, delta: 20 }, { stat: 'WIS', before: 0, after: 20, delta: 20 }],
        })}
      />,
    );
    expect(screen.getByText('INT +20 XP')).toBeOnTheScreen();
    expect(screen.getByText('WIS +20 XP')).toBeOnTheScreen();
  });

  it('shows the completion bonus on its own line', async () => {
    await renderWithTheme(
      <RewardFeedback receipt={receipt({ components: [{ kind: 'stage', stat: 'INT', delta: 20 }, { kind: 'bonus', stat: 'INT', delta: 20 }] })} />,
    );
    expect(screen.getByText('Completion bonus: INT +20 XP')).toBeOnTheScreen();
  });

  it('shows nothing for a replayed receipt (the reward was already given) or one with no totals', async () => {
    await renderWithTheme(
      <>
        <RewardFeedback receipt={receipt({ id: 'a', replayed: true })} />
        <RewardFeedback receipt={receipt({ id: 'b', totals: [] })} />
        <RewardFeedback receipt={null} />
        <RewardFeedback />
      </>,
    );
    expect(screen.queryByText(/XP/)).toBeNull();
  });

  it('hides itself after 4.6 seconds, and not before', async () => {
    await renderWithTheme(<RewardFeedback receipt={receipt()} />);
    await advance(4599);
    expect(screen.getByText('INT +40 XP')).toBeOnTheScreen();
    await advance(1);
    expect(screen.queryByText('INT +40 XP')).toBeNull();
  });

  it('comes back for a new receipt after it has hidden', async () => {
    await renderWithTheme(<RewardFeedback receipt={receipt()} />);
    await advance(5000);
    expect(screen.queryByText('INT +40 XP')).toBeNull();
    await screen.rerender(<TestThemeProvider><RewardFeedback receipt={receipt({ id: 'r2' })} /></TestThemeProvider>);
    expect(screen.getByText('INT +40 XP')).toBeOnTheScreen();
  });

  it('does not run the count-up timer after it has gone away', async () => {
    const view = await renderWithTheme(<RewardFeedback receipt={receipt()} />);
    await view.unmount();
    await expect(advance(5000)).resolves.toBeUndefined();
  });
});
