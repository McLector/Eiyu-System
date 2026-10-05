import { screen, userEvent } from '@testing-library/react-native';
import { PALETTE_TOKENS, STAT_COLORS } from '@eiyu/shared';
import { StyleSheet } from 'react-native';

import { Chip } from '../chip';
import { StatChip } from '../stat-chip';
import { renderWithTheme } from '../test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = PALETTE_TOKENS.cyan.dark;

describe('Chip', () => {
  it('is a radio that reports whether it is chosen', async () => {
    await renderWithTheme(
      <>
        <Chip label="Mon" selected onPress={() => {}} />
        <Chip label="Tue" selected={false} onPress={() => {}} />
      </>,
    );
    expect(screen.getByRole('radio', { name: 'Mon' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Tue' })).not.toBeChecked();
  });

  it('can be a checkbox instead, for several choices at once', async () => {
    await renderWithTheme(<Chip kind="checkbox" label="Mon" selected onPress={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'Mon' })).toBeChecked();
  });

  it('runs onPress when pressed', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Chip label="Mon" selected={false} onPress={onPress} />);
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Mon' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses when disabled', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Chip label="Mon" selected={false} onPress={onPress} disabled />);
    const chip = screen.getByRole('radio', { name: 'Mon' });
    expect(chip).toBeDisabled();
    await userEvent.setup().press(chip);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('tints the chosen chip from the palette and leaves the others plain', async () => {
    await renderWithTheme(
      <>
        <Chip label="Mon" selected onPress={() => {}} />
        <Chip label="Tue" selected={false} onPress={() => {}} />
      </>,
    );
    expect(screen.getByRole('radio', { name: 'Mon' })).toHaveStyle({ backgroundColor: T['accent-glass'], borderColor: T['accent-border'] });
    expect(screen.getByText('Mon')).toHaveStyle({ color: T['accent-text'] });
    expect(screen.getByRole('radio', { name: 'Tue' })).toHaveStyle({ borderColor: T['glass-border'] });
    expect(screen.getByText('Tue')).toHaveStyle({ color: T['dim-flat'] });
  });

  it('is 48dp tall, and the compact day-chip form is still 48dp tall', async () => {
    await renderWithTheme(
      <>
        <Chip label="Mon" selected={false} onPress={() => {}} />
        <Chip label="M" compact selected={false} onPress={() => {}} />
      </>,
    );
    expect(StyleSheet.flatten(screen.getByRole('radio', { name: 'Mon' }).props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(screen.getByRole('radio', { name: 'M' }).props.style).minHeight).toBeGreaterThanOrEqual(48);
  });

  it('can be read out as something longer than what it shows', async () => {
    await renderWithTheme(<Chip label="M" accessibilityLabel="Monday" selected onPress={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Monday' })).toBeOnTheScreen();
  });
});

describe('StatChip', () => {
  it('is a radio named for the stat', async () => {
    await renderWithTheme(<StatChip stat="STR" selected onPress={() => {}} />);
    expect(screen.getByRole('radio', { name: 'STR' })).toBeChecked();
  });

  it('tints the chosen stat with its own colour, as the web editor does', async () => {
    await renderWithTheme(<StatChip stat="INT" selected onPress={() => {}} />);
    expect(screen.getByRole('radio', { name: 'INT' })).toHaveStyle({ backgroundColor: `${STAT_COLORS.INT}18`, borderColor: `${STAT_COLORS.INT}55` });
    expect(screen.getByText('INT')).toHaveStyle({ color: STAT_COLORS.INT });
  });

  it('is plain when not chosen', async () => {
    await renderWithTheme(<StatChip stat="INT" selected={false} onPress={() => {}} />);
    expect(screen.getByRole('radio', { name: 'INT' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'INT' })).toHaveStyle({ borderColor: T['glass-border'] });
    expect(screen.getByText('INT')).toHaveStyle({ color: T['dim-flat'] });
  });

  it('runs onPress, and not when disabled', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<StatChip stat="WIS" selected={false} onPress={onPress} />);
    await userEvent.setup().press(screen.getByRole('radio', { name: 'WIS' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses when disabled', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<StatChip stat="WIS" selected={false} onPress={onPress} disabled />);
    await userEvent.setup().press(screen.getByRole('radio', { name: 'WIS' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('is at least 48dp tall', async () => {
    await renderWithTheme(<StatChip stat="CHA" selected={false} onPress={() => {}} />);
    expect(StyleSheet.flatten(screen.getByRole('radio', { name: 'CHA' }).props.style).minHeight).toBeGreaterThanOrEqual(48);
  });
});
