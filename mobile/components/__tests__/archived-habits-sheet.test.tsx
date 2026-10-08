import { act, screen, userEvent } from '@testing-library/react-native';
import type { Quest } from '@eiyu/shared';

import ArchivedHabitsSheet from '../eiyu/archived-habits-sheet';
import { renderWithTheme } from '../ui/test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockRestore = jest.fn();
const mockDelete = jest.fn();
let mockQuests: Quest[] = [];

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/contexts/eiyu-store', () => ({
  useEiyu: () => ({ user: { quests: mockQuests }, restoreQuest: mockRestore, deleteQuest: mockDelete }),
}));

function quest(overrides: Partial<Quest>): Quest {
  return {
    id: 'q', name: 'Quest', stat: 'WIS', difficulty: 'Easy', easyVersion: 'Easy version', description: null,
    questType: 'habit', archived: true, time: '08:00', days: [1, 2, 3], streak: 0, frozen: false, completed: false,
    targetCount: null, progressCount: 0, ...overrides,
  } as Quest;
}

const open = () => renderWithTheme(<ArchivedHabitsSheet visible onClose={jest.fn()} />);

beforeEach(() => {
  mockRestore.mockReset().mockResolvedValue(undefined);
  mockDelete.mockReset().mockResolvedValue(undefined);
  mockQuests = [
    quest({ id: 'a', name: 'Read 20 pages', questType: 'habit' }),
    quest({ id: 'b', name: 'Pay the rent', questType: 'one_time' }),
    quest({ id: 'c', name: 'Still active', archived: false }),
  ];
});

describe('ArchivedHabitsSheet', () => {
  it('lists the archived quests only, and says what kind each one is', async () => {
    await open();
    expect(screen.getByText('Read 20 pages')).toBeOnTheScreen();
    expect(screen.getByText('Recurring habit')).toBeOnTheScreen();
    expect(screen.getByText('Pay the rent')).toBeOnTheScreen();
    expect(screen.getByText('1-Time quest')).toBeOnTheScreen();
    expect(screen.queryByText('Still active')).toBeNull();
  });

  it('says so when nothing is archived', async () => {
    mockQuests = [quest({ id: 'c', name: 'Still active', archived: false })];
    await open();
    expect(screen.getByTestId('archived-empty')).toBeOnTheScreen();
    expect(screen.getByText('No archived quests. Archived definitions will stay here with their history.')).toBeOnTheScreen();
  });

  it('shows nothing while hidden', async () => {
    await renderWithTheme(<ArchivedHabitsSheet visible={false} onClose={jest.fn()} />);
    expect(screen.queryByText('Read 20 pages')).toBeNull();
  });

  it('closes from its Close button', async () => {
    const onClose = jest.fn();
    await renderWithTheme(<ArchivedHabitsSheet visible onClose={onClose} />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close Archived habits' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores a quest, and only that row is busy while it works', async () => {
    let finish!: () => void;
    mockRestore.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    await open();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Restore Read 20 pages' }));
    expect(mockRestore).toHaveBeenCalledWith('a');
    expect(screen.getByRole('button', { name: 'Restore Read 20 pages' })).toBeBusy();
    expect(screen.getByRole('button', { name: 'Delete Read 20 pages' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restore Pay the rent' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete Pay the rent' })).toBeEnabled();
    await act(async () => { finish(); });
    expect(screen.getByRole('button', { name: 'Restore Read 20 pages' })).not.toBeBusy();
  });

  it('shows why a restore failed and keeps the row', async () => {
    mockRestore.mockRejectedValueOnce(new Error('You are offline.'));
    await open();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Restore Read 20 pages' }));
    expect(screen.getByRole('alert')).toHaveTextContent('You are offline.');
    expect(screen.getByText('Read 20 pages')).toBeOnTheScreen();
  });

  it('clears an old error when the next action starts', async () => {
    mockRestore.mockRejectedValueOnce(new Error('You are offline.'));
    await open();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Restore Read 20 pages' }));
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Restore Pay the rent' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('asks before deleting for good, and does nothing until confirmed', async () => {
    await open();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Read 20 pages' }));
    expect(screen.getByText('Delete permanently?')).toBeOnTheScreen();
    expect(mockDelete).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete permanently?')).toBeNull();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes the chosen quest once confirmed, then closes the question', async () => {
    await open();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Pay the rent' }));
    await user.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith('b');
    expect(screen.queryByText('Delete permanently?')).toBeNull();
  });

  it('cannot be cancelled while the delete is running', async () => {
    let finish!: () => void;
    mockDelete.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    await open();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Read 20 pages' }));
    await user.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm permanent delete' })).toBeBusy();
    await act(async () => { finish(); });
    expect(screen.queryByText('Delete permanently?')).toBeNull();
  });

  it('shows why a delete failed, closes the question and keeps the row', async () => {
    mockDelete.mockRejectedValueOnce(new Error('The System could not delete it.'));
    await open();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Delete Read 20 pages' }));
    await user.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
    expect(screen.queryByText('Delete permanently?')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('The System could not delete it.');
    expect(screen.getByText('Read 20 pages')).toBeOnTheScreen();
  });
});
