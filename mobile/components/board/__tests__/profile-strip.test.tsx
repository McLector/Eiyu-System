import { screen, userEvent } from '@testing-library/react-native';
import { initialUser, RANK_CONFIG, type UserProfile } from '@eiyu/shared';

import { renderWithTheme } from '../../ui/test-theme';
import { ProfileStrip } from '../profile-strip';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stats: UserProfile['stats'] = {
  ...initialUser.stats,
  STR: { level: 3, xp: 40, xpMax: 100 },
  INT: { level: 5, xp: 150, xpMax: 100 },
  WIS: { level: 1, xp: -10, xpMax: 100 },
  DEX: { level: 2, xp: 0, xpMax: 100 },
  CHA: { level: 4, xp: 99, xpMax: 100 },
} as UserProfile['stats'];

function strip(overrides: Partial<React.ComponentProps<typeof ProfileStrip>> = {}) {
  return renderWithTheme(
    <ProfileStrip name="Yuki Tanaka" userClass="Ranger" rank="C" stats={stats} completed={3} total={7} {...overrides} />,
  );
}

describe('ProfileStrip collapsed', () => {
  it('shows who you are, your rank and how today is going', async () => {
    await strip();
    expect(screen.getByText('YT')).toBeOnTheScreen();
    expect(screen.getByTestId('board-profile-name')).toHaveTextContent('Yuki Tanaka');
    expect(screen.getByText('Ranger')).toBeOnTheScreen();
    expect(screen.getByText('C')).toBeOnTheScreen();
    expect(screen.getByText('TODAY 3/7')).toBeOnTheScreen();
  });

  it('contains an 80-character name beside the rank badge instead of pushing it away', async () => {
    const long = 'N'.repeat(80);
    await strip({ name: long });
    const name = screen.getByTestId('board-profile-name');
    expect(name).toHaveProp('numberOfLines', 2);
    expect(name).toHaveProp('ellipsizeMode', 'tail');
    expect(screen.getByText('C')).toBeOnTheScreen();
  });

  it('draws the rank in its own colour', async () => {
    await strip({ rank: 'S' });
    expect(screen.getByText('S')).toHaveStyle({ color: RANK_CONFIG.S.color });
  });

  it('keeps the stat rows out of the way until asked', async () => {
    await strip();
    expect(screen.queryByRole('progressbar', { name: /XP progress/ })).toBeNull();
  });

  it('reports today as a progress bar a screen reader can read', async () => {
    await strip();
    const bar = screen.getByRole('progressbar', { name: 'Quests completed today' });
    expect(bar).toHaveProp('accessibilityValue', { min: 0, max: 7, now: 3 });
  });

  it('copes with a day that has nothing due', async () => {
    await strip({ completed: 0, total: 0 });
    expect(screen.getByText('TODAY 0/0')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Quests completed today' })).toHaveProp('accessibilityValue', { min: 0, max: 0, now: 0 });
  });
});

describe('ProfileStrip today bar', () => {
  it('fills in proportion to what is done', async () => {
    await strip({ completed: 3, total: 6 });
    expect(screen.getByTestId('today-fill')).toHaveStyle({ width: '50%' });
  });

  it('is empty, not NaN, when nothing is due', async () => {
    await strip({ completed: 0, total: 0 });
    expect(screen.getByTestId('today-fill')).toHaveStyle({ width: '0%' });
  });

  it('never overfills if more is done than was due', async () => {
    await strip({ completed: 9, total: 7 });
    expect(screen.getByTestId('today-fill')).toHaveStyle({ width: '100%' });
  });
});

describe('ProfileStrip expanding', () => {
  it('opens to the five stats with their levels and XP bars', async () => {
    const user = userEvent.setup();
    await strip();
    const trigger = screen.getByRole('button', { name: /Yuki Tanaka.*rank C.*3 of 7/ });
    expect(trigger).toBeCollapsed();
    await user.press(trigger);
    expect(screen.getByRole('button', { name: /Yuki Tanaka.*rank C.*3 of 7/ })).toBeExpanded();
    expect(screen.getAllByRole('progressbar', { name: /XP progress/ })).toHaveLength(5);
    expect(screen.getByRole('progressbar', { name: 'STR XP progress: 40% to level 4' })).toBeOnTheScreen();
  });

  it('shows each stat level', async () => {
    await strip();
    await userEvent.setup().press(screen.getByRole('button', { name: /Yuki Tanaka/ }));
    expect(screen.getByText('5')).toBeOnTheScreen();
  });

  it('keeps an XP percentage between 0 and 100 whatever the numbers say', async () => {
    await strip();
    await userEvent.setup().press(screen.getByRole('button', { name: /Yuki Tanaka/ }));
    expect(screen.getByRole('progressbar', { name: 'INT XP progress: 100% to level 6' })).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'WIS XP progress: 0% to level 2' })).toBeOnTheScreen();
  });

  it('closes again on a second press', async () => {
    const user = userEvent.setup();
    await strip();
    await user.press(screen.getByRole('button', { name: /Yuki Tanaka/ }));
    await user.press(screen.getByRole('button', { name: /Yuki Tanaka/ }));
    expect(screen.queryByRole('progressbar', { name: /XP progress/ })).toBeNull();
  });
});
