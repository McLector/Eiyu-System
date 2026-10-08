import { screen, userEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { renderWithTheme } from '../../ui/test-theme';
import { AddQuestSheet, type QuestTypeChoice } from '../add-quest-sheet';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const open = (types: QuestTypeChoice[], visible = true) => {
  const props = { visible, types, onChoose: jest.fn(), onClose: jest.fn() };
  return renderWithTheme(<AddQuestSheet {...props} />).then(() => props);
};

describe('AddQuestSheet', () => {
  it('shows nothing while hidden', async () => {
    await open(['habit', 'one_time'], false);
    expect(screen.queryByText('NEW QUEST')).toBeNull();
  });

  it('asks what kind of quest, with the wording the flows tap', async () => {
    await open(['habit', 'one_time']);
    expect(screen.getByText('NEW QUEST')).toBeOnTheScreen();
    expect(screen.getByText('What kind of quest is this?')).toBeOnTheScreen();
    expect(screen.getByText('HABIT QUEST')).toBeOnTheScreen();
    expect(screen.getByText('Repeats on chosen days — build streaks')).toBeOnTheScreen();
    expect(screen.getByText('1-TIME QUEST')).toBeOnTheScreen();
    expect(screen.getByText('A todo for today only — done or gone, no streak')).toBeOnTheScreen();
  });

  it('offers only the kinds it is given', async () => {
    await open(['habit', 'one_time']);
    expect(screen.queryByText('BACKLOG QUEST')).toBeNull();
  });

  it('can offer Backlog as well', async () => {
    await open(['habit', 'one_time', 'backlog']);
    expect(screen.getByText('BACKLOG QUEST')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create a backlog quest' })).toBeOnTheScreen();
  });

  it.each([
    ['Create a habit quest', 'habit'],
    ['Create a 1-time quest', 'one_time'],
    ['Create a backlog quest', 'backlog'],
  ] as const)('%s reports %s once', async (name, type) => {
    const p = await open(['habit', 'one_time', 'backlog']);
    await userEvent.setup().press(screen.getByRole('button', { name }));
    expect(p.onChoose).toHaveBeenCalledTimes(1);
    expect(p.onChoose).toHaveBeenCalledWith(type);
  });

  it('keeps every choice at least 48dp tall and the list scrollable at large font sizes', async () => {
    await open(['habit', 'one_time', 'backlog']);
    for (const name of ['Create a habit quest', 'Create a 1-time quest', 'Create a backlog quest']) {
      expect(StyleSheet.flatten(screen.getByRole('button', { name }).props.style).minHeight).toBeGreaterThanOrEqual(48);
    }
    expect(screen.getByTestId('board-type-chooser-scroll')).toBeOnTheScreen();
  });

  it('closes from its Close button', async () => {
    const p = await open(['habit', 'one_time']);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close' }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});
