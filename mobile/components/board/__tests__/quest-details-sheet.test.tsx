import { screen, userEvent } from '@testing-library/react-native';
import type { Quest } from '@eiyu/shared';

import { renderWithTheme } from '../../ui/test-theme';
import { QuestDetailsSheet } from '../quest-details-sheet';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'q', name: 'Read 20 pages', stat: 'INT', difficulty: 'Medium', easyVersion: 'Read 5 pages', description: 'Before bed', questType: 'habit',
    archived: false, time: '08:00', days: [1, 3], streak: 0, frozen: false, completed: false, targetCount: null, progressCount: 0,
    ...overrides,
  } as Quest;
}
const open = (q: Quest | null, extra: Partial<React.ComponentProps<typeof QuestDetailsSheet>> = {}) => {
  const props = { quest: q, accountToday: '2026-10-05', onClose: jest.fn(), onEdit: jest.fn(), ...extra };
  return renderWithTheme(<QuestDetailsSheet {...props} />).then(() => props);
};

describe('QuestDetailsSheet', () => {
  it('shows nothing without a quest', async () => {
    await open(null);
    expect(screen.queryByText('QUEST DETAILS')).toBeNull();
  });

  it('shows the quest, its kind and its schedule', async () => {
    await open(quest());
    expect(screen.getByText('QUEST DETAILS')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Read 20 pages' })).toBeOnTheScreen();
    expect(screen.getByText('INT')).toBeOnTheScreen();
    expect(screen.getByText('Medium')).toBeOnTheScreen();
    expect(screen.getByText('Habit')).toBeOnTheScreen();
    expect(screen.getByText('Mon, Wed at 08:00')).toBeOnTheScreen();
  });

  it('adds the streak to the schedule line when there is one', async () => {
    await open(quest({ streak: 5 }));
    expect(screen.getByText('Mon, Wed at 08:00 · 5-day streak')).toBeOnTheScreen();
  });

  it('uses the account date, not the phone clock, to say Today', async () => {
    await open(quest({ questType: 'one_time', scheduledDate: '2026-10-05', time: '09:30', timeSet: true, days: [] }));
    expect(screen.getByText('Today at 09:30')).toBeOnTheScreen();
  });

  it('says No date for an undated quest, and Upcoming with the date for a later one', async () => {
    await open(quest({ questType: 'one_time', scheduledDate: null, timeSet: false, days: [] }));
    expect(screen.getByText('No date')).toBeOnTheScreen();
  });

  it('formats the date of an upcoming quest', async () => {
    await open(quest({ questType: 'one_time', scheduledDate: '2026-10-12', time: '09:30', timeSet: true, days: [] }));
    expect(screen.getByText('Upcoming Oct 12 at 09:30')).toBeOnTheScreen();
  });

  it('shows the note and, for a habit, the penalty', async () => {
    await open(quest());
    expect(screen.getByText('NOTE')).toBeOnTheScreen();
    expect(screen.getByText('Before bed')).toBeOnTheScreen();
    expect(screen.getByText('PENALTY')).toBeOnTheScreen();
    expect(screen.getByText('Read 5 pages')).toBeOnTheScreen();
  });

  it('shows neither a note nor a penalty when they are empty', async () => {
    await open(quest({ description: null, easyVersion: null }));
    expect(screen.queryByText('NOTE')).toBeNull();
    expect(screen.queryByText('PENALTY')).toBeNull();
  });

  it('never shows a penalty for a one-time or Backlog quest, even if the data carries one', async () => {
    await open(quest({ questType: 'backlog', easyVersion: 'Stale penalty', days: [] }));
    expect(screen.queryByText('PENALTY')).toBeNull();
    expect(screen.getByText('No date yet')).toBeOnTheScreen();
  });

  it('shows the genre of a Backlog quest', async () => {
    await open(quest({ questType: 'backlog', genre: 'concept', days: [] }));
    expect(screen.getByText('Concept')).toBeOnTheScreen();
    expect(screen.getByText('Backlog')).toBeOnTheScreen();
  });

  it('closes from Close, and edits from Edit quest', async () => {
    const p = await open(quest());
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Edit quest' }));
    expect(p.onEdit).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(p.onClose).toHaveBeenCalled();
  });
});
