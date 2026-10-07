import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { PALETTE_TOKENS, type Quest } from '@eiyu/shared';
import { StyleSheet, View } from 'react-native';

import { renderWithTheme } from '../../ui/test-theme';
import { QuestRow } from '../quest-row';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = PALETTE_TOKENS.cyan.dark;

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'q', name: 'Read 20 pages', stat: 'INT', difficulty: 'Easy', easyVersion: 'Read 5', description: null, questType: 'habit',
    archived: false, time: '08:00', days: [1, 3, 5], streak: 0, frozen: false, completed: false, targetCount: null,
    progressCount: 0, ...overrides,
  } as Quest;
}

function props(q: Quest, extra: Partial<React.ComponentProps<typeof QuestRow>> = {}) {
  return { quest: q, pending: false, onToggle: jest.fn(), onOpen: jest.fn(), onAdjustProgress: jest.fn(), onActions: jest.fn(), ...extra };
}
const render = (q: Quest, extra: Partial<React.ComponentProps<typeof QuestRow>> = {}) => {
  const p = props(q, extra);
  return renderWithTheme(<QuestRow {...p} />).then(() => p);
};

describe('QuestRow completion', () => {
  it('shows an unchecked checkbox and completes on press', async () => {
    const p = await render(quest());
    const box = screen.getByTestId('quest-checkbox');
    expect(box).not.toBeChecked();
    await userEvent.setup().press(box);
    expect(p.onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows a completed quest as checked, named as completed, dimmed and struck through', async () => {
    await render(quest({ completed: true }));
    const box = screen.getByTestId('quest-checkbox');
    expect(box).toBeChecked();
    expect(box).toHaveProp('accessibilityLabel', 'Read 20 pages (completed)');
    expect(screen.getByText('Read 20 pages')).toHaveStyle({ textDecorationLine: 'line-through' });
  });

  it('keeps the checkbox at least 48dp square', async () => {
    await render(quest());
    const style = StyleSheet.flatten(screen.getByTestId('quest-checkbox').props.style);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
  });

  it('cannot be completed while an action on it is pending', async () => {
    const p = await render(quest(), { pending: true });
    const box = screen.getByTestId('quest-checkbox');
    expect(box).toBeDisabled();
    await userEvent.setup().press(box);
    expect(p.onToggle).not.toHaveBeenCalled();
  });
});

describe('QuestRow progress stepper', () => {
  it('shows progress and has no checkbox for a quest with a target', async () => {
    await render(quest({ targetCount: 5, progressCount: 2 }));
    expect(screen.getByText('2/5')).toBeOnTheScreen();
    expect(screen.queryByTestId('quest-checkbox')).toBeNull();
  });

  it('steps up and down by one', async () => {
    const p = await render(quest({ targetCount: 5, progressCount: 2 }));
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Increase progress for Read 20 pages' }));
    expect(p.onAdjustProgress).toHaveBeenLastCalledWith(1);
    await user.press(screen.getByRole('button', { name: 'Decrease progress for Read 20 pages' }));
    expect(p.onAdjustProgress).toHaveBeenLastCalledWith(-1);
  });

  it('cannot go below zero', async () => {
    await render(quest({ targetCount: 5, progressCount: 0 }));
    expect(screen.getByRole('button', { name: 'Decrease progress for Read 20 pages' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase progress for Read 20 pages' })).toBeEnabled();
  });

  it('cannot go above the target', async () => {
    await render(quest({ targetCount: 5, progressCount: 5, completed: true }));
    expect(screen.getByRole('button', { name: 'Increase progress for Read 20 pages' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decrease progress for Read 20 pages' })).toBeEnabled();
  });
});

describe('QuestRow Backlog', () => {
  it('has no way to complete a Backlog quest', async () => {
    await render(quest({ questType: 'backlog', days: [] }));
    expect(screen.queryByTestId('quest-checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /progress for/ })).toBeNull();
    expect(screen.getByText('No date')).toBeOnTheScreen();
  });
});

describe('QuestRow details', () => {
  it('shows the stat, and when it is due', async () => {
    await render(quest());
    expect(screen.getByText('INT')).toBeOnTheScreen();
    expect(screen.getByText('Mon, Wed, Fri 08:00')).toBeOnTheScreen();
  });

  it('says Today for a one-time quest, with its time when it has one', async () => {
    await render(quest({ questType: 'one_time', time: '09:30', timeSet: true }));
    expect(screen.getByText('Today 09:30')).toBeOnTheScreen();
  });

  it('says No date for an undated one-time quest and Upcoming with the date for a later one', async () => {
    await render(quest({ questType: 'one_time', days: [], timeSet: false, scheduledDate: null }), { today: '2026-10-05' });
    expect(screen.getByText('No date')).toBeOnTheScreen();
  });

  it('says Upcoming and the date, with the time when one is set', async () => {
    await render(quest({ questType: 'one_time', days: [], timeSet: true, time: '09:30', scheduledDate: '2026-10-12' }), { today: '2026-10-05' });
    expect(screen.getByText('Upcoming Oct 12 09:30')).toBeOnTheScreen();
  });

  it('keeps Today when no account date is passed', async () => {
    await render(quest({ questType: 'one_time', days: [], timeSet: false, scheduledDate: '2026-10-12' }));
    expect(screen.getByText('Today')).toBeOnTheScreen();
  });

  it('can complete an upcoming quest from its check', async () => {
    const p = await render(quest({ questType: 'one_time', days: [], timeSet: false, scheduledDate: '2026-10-12' }), { today: '2026-10-05' });
    await userEvent.setup().press(screen.getByTestId('quest-checkbox'));
    expect(p.onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the genre of a one-time or Backlog quest, and none for a habit', async () => {
    await render(quest({ questType: 'backlog', genre: 'tool', days: [] }));
    expect(screen.getByText('Tool')).toBeOnTheScreen();
  });

  it('shows no genre for a habit', async () => {
    await render(quest({ genre: 'tool' }));
    expect(screen.queryByText('Tool')).toBeNull();
  });

  it('shows the streak with a flame, and nothing at zero', async () => {
    await render(quest({ streak: 5 }));
    expect(screen.getByText('5')).toBeOnTheScreen();
    expect(screen.getByTestId('fire-streak', { includeHiddenElements: true })).toBeTruthy();
  });

  it('shows no flame without a streak', async () => {
    await render(quest({ streak: 0 }));
    expect(screen.queryByTestId('fire-streak', { includeHiddenElements: true })).toBeNull();
  });

  it('marks a frozen streak', async () => {
    await render(quest({ frozen: true }));
    expect(screen.getByLabelText('Streak frozen')).toBeOnTheScreen();
  });

  it('flashes the XP just earned', async () => {
    await render(quest(), { xpToast: 20 });
    expect(screen.getByText('+20 XP')).toBeOnTheScreen();
  });

  it('shows no XP flash by default', async () => {
    await render(quest());
    expect(screen.queryByText(/XP/)).toBeNull();
  });

  it('draws in the palette', async () => {
    await renderWithTheme(<QuestRow {...props(quest())} />, { palette: 'jade', mode: 'light' });
    expect(screen.getByText('Read 20 pages')).toHaveStyle({ color: PALETTE_TOKENS.jade.light.text });
    expect(T.text).not.toBe(PALETTE_TOKENS.jade.light.text);
  });
});

describe('QuestRow opening and actions', () => {
  it('opens the details when the title is pressed', async () => {
    const p = await render(quest());
    await userEvent.setup().press(screen.getByTestId('quest-edit-trigger'));
    expect(p.onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('quest-edit-trigger')).toHaveProp('accessibilityLabel', 'Open Read 20 pages details');
  });

  it('opens the action sheet from the more button', async () => {
    const p = await render(quest());
    await userEvent.setup().press(screen.getByRole('button', { name: 'More actions for Read 20 pages' }));
    expect(p.onActions).toHaveBeenCalledTimes(1);
    expect(p.onOpen).not.toHaveBeenCalled();
  });

  it('opens the action sheet from a long press on the title', async () => {
    const p = await render(quest());
    await fireEvent(screen.getByTestId('quest-edit-trigger'), 'longPress');
    expect(p.onActions).toHaveBeenCalledTimes(1);
  });

  it('offers the actions to a screen reader as a custom action too', async () => {
    const p = await render(quest());
    const title = screen.getByTestId('quest-edit-trigger');
    expect(title.props.accessibilityActions).toEqual([{ name: 'actions', label: 'More actions' }]);
    await fireEvent(title, 'accessibilityAction', { nativeEvent: { actionName: 'actions' } });
    expect(p.onActions).toHaveBeenCalledTimes(1);
  });

  it('disables the more button and shows it busy while an action is pending', async () => {
    const p = await render(quest(), { pending: true });
    const more = screen.getByRole('button', { name: 'More actions for Read 20 pages' });
    expect(more).toBeDisabled();
    expect(more).toBeBusy();
    await userEvent.setup().press(more);
    expect(p.onActions).not.toHaveBeenCalled();
  });

  it('keeps the more button at least 48dp square', async () => {
    await render(quest());
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'More actions for Read 20 pages' }).props.style);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
  });
});

describe('QuestRow sync tag', () => {
  it('shows no tag and keeps the plain labels when nothing is waiting', async () => {
    await render(quest());
    expect(screen.queryByTestId('quest-sync-tag')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Read 20 pages details' })).toBeOnTheScreen();
  });

  it.each([
    ['pending', 'Waiting to sync', ', waiting to sync'],
    ['checking', 'Checking', ', checking'],
    ['failed', 'Not saved', ', not saved'],
  ] as const)('tags a %s write with text and puts it in the spoken label', async (state, text, spoken) => {
    await render(quest(), { syncState: state });
    expect(screen.getByTestId('quest-sync-tag')).toHaveTextContent(text);
    expect(screen.getByRole('button', { name: `Open Read 20 pages details${spoken}` })).toBeOnTheScreen();
    expect(screen.getByTestId('quest-checkbox').props.accessibilityLabel).toBe(`Read 20 pages${spoken}`);
  });

  it('keeps the completed wording alongside the sync wording', async () => {
    await render(quest({ completed: true }), { syncState: 'pending' });
    expect(screen.getByTestId('quest-checkbox').props.accessibilityLabel).toBe('Read 20 pages (completed), waiting to sync');
  });

  it('colours a failed tag as an error and the others as muted, so colour is never the only cue', async () => {
    await render(quest(), { syncState: 'failed' });
    const failedText = screen.getByText('Not saved');
    expect(StyleSheet.flatten(failedText.props.style).color).toBe(T.danger);
  });

  it('puts the tag on a quantity quest too', async () => {
    await render(quest({ targetCount: 4, progressCount: 1 }), { syncState: 'pending' });
    expect(screen.getByTestId('quest-sync-tag')).toBeOnTheScreen();
  });
});

describe('QuestRow grip slot', () => {
  it('shows the grip it is given, before the check', async () => {
    await render(quest(), { grip: <View testID="row-grip" /> });
    expect(screen.getByTestId('row-grip')).toBeOnTheScreen();
    expect(screen.getByTestId('quest-checkbox')).toBeOnTheScreen();
  });

  it('shows no grip by default', async () => {
    await render(quest());
    expect(screen.queryByTestId('row-grip')).toBeNull();
  });
});
