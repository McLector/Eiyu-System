import { screen, userEvent } from '@testing-library/react-native';
import { PALETTE_TOKENS } from '@eiyu/shared';
import { StyleSheet, Text } from 'react-native';

import { Button } from '../button';
import { renderWithTheme } from '../test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = PALETTE_TOKENS.cyan.dark;
const VARIANTS = ['primary', 'secondary', 'quiet', 'destructive'] as const;

describe('Button', () => {
  it.each(VARIANTS)('%s shows its label and runs onPress once', async variant => {
    const onPress = jest.fn();
    await renderWithTheme(<Button variant={variant} label="Save" onPress={onPress} />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps the label as written and uppercases it with style, so screen readers read it normally', async () => {
    await renderWithTheme(<Button variant="primary" label="Save changes" onPress={() => {}} />);
    expect(screen.getByText('Save changes')).toHaveStyle({ textTransform: 'uppercase' });
  });

  it('uses the palette for each variant', async () => {
    await renderWithTheme(<Button variant="primary" label="Go" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveStyle({ backgroundColor: T.accent, borderColor: T.accent });
    expect(screen.getByText('Go')).toHaveStyle({ color: T['on-accent'] });
  });

  it('draws secondary as an outline, quiet as bare text and destructive in the danger colour', async () => {
    await renderWithTheme(
      <>
        <Button variant="secondary" label="Two" onPress={() => {}} />
        <Button variant="quiet" label="Three" onPress={() => {}} />
        <Button variant="destructive" label="Four" onPress={() => {}} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Two' })).toHaveStyle({ borderColor: T['accent-border'], backgroundColor: 'transparent' });
    expect(screen.getByText('Two')).toHaveStyle({ color: T['accent-text'] });
    expect(screen.getByRole('button', { name: 'Three' })).toHaveStyle({ borderColor: 'transparent' });
    expect(screen.getByText('Three')).toHaveStyle({ color: T['muted-flat'] });
    expect(screen.getByRole('button', { name: 'Four' })).toHaveStyle({ borderColor: T['danger-border'] });
    expect(screen.getByText('Four')).toHaveStyle({ color: T.danger });
  });

  it('is at least 48dp tall', async () => {
    await renderWithTheme(<Button variant="primary" label="Tall" onPress={() => {}} />);
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Tall' }).props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
  });

  it('ignores presses and reports itself disabled when disabled', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button variant="primary" label="Nope" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Nope' });
    expect(button).toBeDisabled();
    await userEvent.setup().press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('while busy: announces it, keeps its label and ignores a second press', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button variant="primary" label="Saving" onPress={onPress} busy />);
    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toBeBusy();
    await userEvent.setup().press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows an icon beside the label when given one', async () => {
    await renderWithTheme(<Button variant="secondary" label="Add" onPress={() => {}} icon={<Text>+</Text>} />);
    expect(screen.getByText('+')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Add/ })).toBeOnTheScreen();
  });

  it('follows the palette and theme', async () => {
    await renderWithTheme(<Button variant="primary" label="Go" onPress={() => {}} />, { palette: 'lime', mode: 'light' });
    expect(screen.getByRole('button', { name: 'Go' })).toHaveStyle({ backgroundColor: PALETTE_TOKENS.lime.light.accent });
  });
});
