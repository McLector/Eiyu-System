import { act, screen, userEvent } from '@testing-library/react-native';
import type { Quest } from '@eiyu/shared';

import { renderWithTheme } from '../../ui/test-theme';
import { DeleteQuestModal } from '../delete-quest-modal';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const quest = { id: 'q', name: 'Read 20 pages' } as Quest;
const back = async () => { await act(async () => { screen.getByTestId('board-delete-modal').props.onRequestClose(); }); };

function setup(over: Partial<React.ComponentProps<typeof DeleteQuestModal>> = {}) {
  const props = { quest, pending: false, error: null, onCancel: jest.fn(), onConfirm: jest.fn(), ...over };
  return renderWithTheme(<DeleteQuestModal {...props} />).then(() => props);
}

describe('DeleteQuestModal', () => {
  it('shows nothing without a quest', async () => {
    await setup({ quest: null });
    expect(screen.queryByText(/PERMANENTLY/)).toBeNull();
  });

  it('names the quest and says what is and is not lost', async () => {
    await setup();
    expect(screen.getByText('DELETE Read 20 pages PERMANENTLY?')).toBeOnTheScreen();
    expect(screen.getByText(/History, Weekly Review, and earned XP remain/)).toBeOnTheScreen();
    expect(screen.getByText(/cannot be undone/)).toBeOnTheScreen();
  });

  it('cancels from its Cancel button, and from Back', async () => {
    const p = await setup();
    await userEvent.setup().press(screen.getByTestId('board-delete-cancel'));
    expect(p.onCancel).toHaveBeenCalledTimes(1);
    await back();
    expect(p.onCancel).toHaveBeenCalledTimes(2);
  });

  it('confirms only from the named confirm button', async () => {
    const p = await setup();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
    expect(p.onConfirm).toHaveBeenCalledTimes(1);
    expect(p.onCancel).not.toHaveBeenCalled();
  });

  it('while deleting: holds both buttons, shows the confirm as busy and ignores Back', async () => {
    const p = await setup({ pending: true });
    expect(screen.getByTestId('board-delete-cancel')).toBeDisabled();
    expect(screen.getByTestId('board-delete-confirm')).toBeBusy();
    const user = userEvent.setup();
    await user.press(screen.getByTestId('board-delete-confirm'));
    await user.press(screen.getByTestId('board-delete-cancel'));
    await back();
    expect(p.onConfirm).not.toHaveBeenCalled();
    expect(p.onCancel).not.toHaveBeenCalled();
  });

  it('keeps a failure on screen as an alert so it can be retried', async () => {
    await setup({ error: 'The System could not delete it.' });
    expect(screen.getByRole('alert')).toHaveTextContent('The System could not delete it.');
    expect(screen.getByTestId('board-delete-confirm')).toBeEnabled();
  });
});
