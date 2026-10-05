import { screen, userEvent } from '@testing-library/react-native';
import type { Quest } from '@eiyu/shared';

import { renderWithTheme } from '../../ui/test-theme';
import { AllHabitsSheet } from '../all-habits-sheet';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function habit(overrides: Partial<Quest>): Quest {
  return {
    id: 'a', name: 'Read', stat: 'INT', difficulty: 'Easy', easyVersion: 'Read 1', description: null, questType: 'habit', archived: false,
    time: '08:00', days: [1, 3], streak: 0, frozen: false, completed: false, targetCount: null, progressCount: 0, dailyEligible: false,
    ...overrides,
  } as Quest;
}
const open = (habits: Quest[], pendingIds: string[] = [], visible = true) => {
  const props = { visible, habits, pendingIds: new Set(pendingIds), onOpen: jest.fn(), onActions: jest.fn(), onClose: jest.fn() };
  return renderWithTheme(<AllHabitsSheet {...props} />).then(() => props);
};

describe('AllHabitsSheet', () => {
  it('shows nothing while hidden', async () => {
    await open([habit({})], [], false);
    expect(screen.queryByText('ALL HABITS')).toBeNull();
  });

  it('lists every habit with its schedule', async () => {
    await open([habit({}), habit({ id: 'b', name: 'Stretch', days: [0, 1, 2, 3, 4, 5, 6] }), habit({ id: 'c', name: 'Idle', days: [] })]);
    expect(screen.getByText('ALL HABITS')).toBeOnTheScreen();
    expect(screen.getByText('Mon, Wed')).toBeOnTheScreen();
    expect(screen.getByText('Every day')).toBeOnTheScreen();
    expect(screen.getByText('No scheduled days')).toBeOnTheScreen();
  });

  it('says whether a habit is due today, done, or off today', async () => {
    await open([
      habit({ id: 'a', name: 'Due', dailyEligible: true }),
      habit({ id: 'b', name: 'Done', dailyEligible: true, completed: true }),
      habit({ id: 'c', name: 'Off', dailyEligible: false }),
    ]);
    expect(screen.getByText('TODAY')).toBeOnTheScreen();
    expect(screen.getByText('DONE')).toBeOnTheScreen();
    expect(screen.getByText('OFF DAY')).toBeOnTheScreen();
    expect(screen.getByText('Mon, Wed · Completed today')).toBeOnTheScreen();
  });

  it('shows target progress for a habit that has one and is due today', async () => {
    await open([habit({ dailyEligible: true, targetCount: 5, progressCount: 2 })]);
    expect(screen.getByText('Mon, Wed · 2/5')).toBeOnTheScreen();
  });

  it('opens the details of the habit that is pressed', async () => {
    const p = await open([habit({}), habit({ id: 'b', name: 'Stretch' })]);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Open Stretch details' }));
    expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('opens the actions of the habit that is pressed, and holds the one that is busy', async () => {
    const p = await open([habit({}), habit({ id: 'b', name: 'Stretch' })], ['b']);
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'More actions for Read' }));
    expect(p.onActions).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    const busy = screen.getByRole('button', { name: 'More actions for Stretch' });
    expect(busy).toBeDisabled();
    await user.press(busy);
    expect(p.onActions).toHaveBeenCalledTimes(1);
  });

  it('says so when there are no habits yet', async () => {
    await open([]);
    expect(screen.getByText('No saved habits yet. Add a recurring quest to build your catalog.')).toBeOnTheScreen();
  });

  it('closes from its Close button', async () => {
    const p = await open([habit({})]);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close' }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});
