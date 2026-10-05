import { act, screen, userEvent } from '@testing-library/react-native';

import { renderWithTheme } from '../test-theme';
import { DiscardChangesModal } from '../discard-changes-modal';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setup(over: Partial<React.ComponentProps<typeof DiscardChangesModal>> = {}) {
  const props = { visible: true, message: 'Your unsaved quest changes will be lost.', onKeep: jest.fn(), onDiscard: jest.fn(), ...over };
  return renderWithTheme(<DiscardChangesModal {...props} />).then(() => props);
}

describe('DiscardChangesModal', () => {
  it('asks the question and says what would be lost', async () => {
    await setup();
    expect(screen.getByLabelText('Discard changes?')).toBeOnTheScreen();
    expect(screen.getByText('Your unsaved quest changes will be lost.')).toBeOnTheScreen();
  });

  it('shows nothing while hidden', async () => {
    await setup({ visible: false });
    expect(screen.queryByLabelText('Discard changes?')).toBeNull();
  });

  it('keeps editing from its button and from system Back, without discarding', async () => {
    const p = await setup({ testID: 'x-discard-modal' });
    await userEvent.setup().press(screen.getByRole('button', { name: 'Keep Editing' }));
    expect(p.onKeep).toHaveBeenCalledTimes(1);
    await act(async () => { screen.getByTestId('x-discard-modal').props.onRequestClose(); });
    expect(p.onKeep).toHaveBeenCalledTimes(2);
    expect(p.onDiscard).not.toHaveBeenCalled();
  });

  it('discards only from the Discard Changes button', async () => {
    const p = await setup();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Discard Changes' }));
    expect(p.onDiscard).toHaveBeenCalledTimes(1);
    expect(p.onKeep).not.toHaveBeenCalled();
  });
});
