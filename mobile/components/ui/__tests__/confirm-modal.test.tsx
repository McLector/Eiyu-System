import { screen, userEvent } from '@testing-library/react-native';

import { ConfirmModal } from '../confirm-modal';
import { renderWithTheme } from '../test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const setup = (over: Record<string, unknown> = {}) => {
  const props = { visible: true, title: 'Delete routine', message: 'Delete Push?', confirmLabel: 'Delete Routine', onCancel: jest.fn(), onConfirm: jest.fn(), ...over };
  return { props, ready: renderWithTheme(<ConfirmModal {...props} />) };
};

describe('ConfirmModal', () => {
  it('shows the title and message and reports Cancel and the confirm action', async () => {
    const { props, ready } = setup();
    await ready;
    const user = userEvent.setup();
    expect(screen.getByText('Delete Push?')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Delete Routine' }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });
  it('renders nothing when hidden', async () => {
    await setup({ visible: false }).ready;
    expect(screen.queryByText('Delete Push?')).toBeNull();
  });
  it('ignores a second press while busy', async () => {
    const { props, ready } = setup({ busy: true });
    await ready;
    await userEvent.setup().press(screen.getByRole('button', { name: 'Delete Routine' }));
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});
