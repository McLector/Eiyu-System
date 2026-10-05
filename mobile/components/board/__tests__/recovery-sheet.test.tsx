import { screen, userEvent } from '@testing-library/react-native';
import type { Quest } from '@eiyu/shared';

import { renderWithTheme } from '../../ui/test-theme';
import { RecoverySheet } from '../recovery-sheet';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function frozen(overrides: Partial<Quest>): Quest {
  return {
    id: 'a', name: 'Run 5k', stat: 'STR', difficulty: 'Easy', easyVersion: 'Walk 10 minutes', description: null, questType: 'habit',
    archived: false, time: '07:00', days: [1], streak: 4, frozen: true, frozenHoursLeft: 6, completed: false, targetCount: null, progressCount: 0,
    ...overrides,
  } as Quest;
}
const open = (quests: Quest[], visible = true) => {
  const props = { visible, quests, onComplete: jest.fn(), onClose: jest.fn() };
  return renderWithTheme(<RecoverySheet {...props} />).then(() => props);
};

describe('RecoverySheet', () => {
  it('shows nothing while hidden', async () => {
    await open([frozen({})], false);
    expect(screen.queryByText('RECOVERY REQUIRED')).toBeNull();
  });

  it('lists each frozen quest with its penalty and how long is left', async () => {
    await open([frozen({}), frozen({ id: 'b', name: 'Meditate', easyVersion: 'Breathe 3 times', frozenHoursLeft: 20 })]);
    expect(screen.getByText('RECOVERY REQUIRED')).toBeOnTheScreen();
    expect(screen.getByText('Run 5k')).toBeOnTheScreen();
    expect(screen.getByText('Penalty: Walk 10 minutes')).toBeOnTheScreen();
    expect(screen.getByText('6h left')).toBeOnTheScreen();
    expect(screen.getByText('Meditate')).toBeOnTheScreen();
    expect(screen.getByText('20h left')).toBeOnTheScreen();
    expect(screen.getAllByText('Streak frozen')).toHaveLength(2);
  });

  it('shows the deadline in the account time zone when the server gave one', async () => {
    await open([frozen({ recoveryDeadline: '2026-10-06T16:30:00Z', recoveryTimeZone: 'UTC' })]);
    expect(screen.getByText(/^Until Oct 6/)).toBeOnTheScreen();
  });

  it('completes the recovery of the quest that was pressed, once', async () => {
    const p = await open([frozen({}), frozen({ id: 'b', name: 'Meditate' })]);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Mark recovery complete for Meditate' }));
    expect(p.onComplete).toHaveBeenCalledTimes(1);
    expect(p.onComplete).toHaveBeenCalledWith('b');
  });

  it('keeps the button text the flows tap', async () => {
    await open([frozen({})]);
    expect(screen.getByText('Mark Recovery Complete')).toBeOnTheScreen();
  });

  it('closes from its Close button', async () => {
    const p = await open([frozen({})]);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close' }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});
