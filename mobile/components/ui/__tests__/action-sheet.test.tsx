import { screen, userEvent } from '@testing-library/react-native';
import { PALETTE_TOKENS } from '@eiyu/shared';
import { StyleSheet, Text } from 'react-native';

import { ActionSheet } from '../action-sheet';
import { renderWithTheme } from '../test-theme';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 16, left: 0, right: 0 }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = PALETTE_TOKENS.cyan.dark;
const ACTIONS = [
  { key: 'details', label: 'Details' },
  { key: 'edit', label: 'Edit quest', icon: <Text>E</Text> },
  { key: 'archive', label: 'Archive', disabled: true },
  { key: 'delete', label: 'Delete permanently', destructive: true },
];

describe('ActionSheet', () => {
  it('lists the actions in order under its title', async () => {
    await renderWithTheme(<ActionSheet visible title="Read 20 pages" actions={ACTIONS} onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Read 20 pages')).toBeOnTheScreen();
    expect(screen.getAllByRole('menuitem').map(row => row.props.accessibilityLabel)).toEqual(['Details', 'Edit quest', 'Archive', 'Delete permanently']);
  });

  it('reports the chosen action and then closes, in that order', async () => {
    const calls: string[] = [];
    await renderWithTheme(
      <ActionSheet visible actions={ACTIONS} onSelect={key => calls.push(`select:${key}`)} onClose={() => calls.push('close')} />,
    );
    await userEvent.setup().press(screen.getByRole('menuitem', { name: 'Edit quest' }));
    expect(calls).toEqual(['select:edit', 'close']);
  });

  it('ignores a disabled action and says it is disabled', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    await renderWithTheme(<ActionSheet visible actions={ACTIONS} onSelect={onSelect} onClose={onClose} />);
    const row = screen.getByRole('menuitem', { name: 'Archive' });
    expect(row).toBeDisabled();
    await userEvent.setup().press(row);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('draws a destructive action in the danger colour and the others in the text colour', async () => {
    await renderWithTheme(<ActionSheet visible actions={ACTIONS} onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Delete permanently')).toHaveStyle({ color: T.danger });
    expect(screen.getByText('Details')).toHaveStyle({ color: T.text });
  });

  it('shows an action icon beside its label', async () => {
    await renderWithTheme(<ActionSheet visible actions={ACTIONS} onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByText('E')).toBeOnTheScreen();
  });

  it('makes every row at least 48dp tall', async () => {
    await renderWithTheme(<ActionSheet visible actions={ACTIONS} onSelect={() => {}} onClose={() => {}} />);
    for (const row of screen.getAllByRole('menuitem')) expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(48);
  });

  it('closes without choosing anything from its Close button', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    await renderWithTheme(<ActionSheet visible title="T" actions={ACTIONS} onSelect={onSelect} onClose={onClose} />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows nothing while hidden', async () => {
    await renderWithTheme(<ActionSheet visible={false} title="T" actions={ACTIONS} onSelect={() => {}} onClose={() => {}} />);
    expect(screen.queryByText('Details')).toBeNull();
  });

  it('copes with no actions at all', async () => {
    await renderWithTheme(<ActionSheet visible title="Empty" actions={[]} onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Empty')).toBeOnTheScreen();
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });
});
