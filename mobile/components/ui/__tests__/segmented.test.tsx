import { screen, userEvent } from '@testing-library/react-native';
import { PALETTE_TOKENS } from '@eiyu/shared';
import { StyleSheet } from 'react-native';

import { Segmented } from '../segmented';
import { renderWithTheme, TestThemeProvider } from '../test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OPTIONS = [
  { value: 'hero', label: 'HERO' },
  { value: 'stats', label: 'STATS' },
  { value: 'weekly', label: 'WEEKLY' },
];
const T = PALETTE_TOKENS.cyan.dark;

describe('Segmented', () => {
  it('is a labelled group of radios, one chosen', async () => {
    await renderWithTheme(<Segmented accessibilityLabel="Status view" options={OPTIONS} value="stats" onChange={() => {}} />);
    // Found by label: the group itself must not be an accessibility element, or it would swallow the radios inside it.
    expect(screen.getByLabelText('Status view')).toHaveProp('accessibilityRole', 'radiogroup');
    expect(screen.getByRole('radio', { name: 'STATS' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'HERO' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'WEEKLY' })).not.toBeChecked();
  });

  it('reports the value of the segment that is pressed', async () => {
    const onChange = jest.fn();
    await renderWithTheme(<Segmented accessibilityLabel="Status view" options={OPTIONS} value="hero" onChange={onChange} />);
    await userEvent.setup().press(screen.getByRole('radio', { name: 'WEEKLY' }));
    expect(onChange).toHaveBeenCalledWith('weekly');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not report a press on the segment that is already chosen', async () => {
    const onChange = jest.fn();
    await renderWithTheme(<Segmented accessibilityLabel="Status view" options={OPTIONS} value="hero" onChange={onChange} />);
    await userEvent.setup().press(screen.getByRole('radio', { name: 'HERO' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the chosen segment in the accent colour', async () => {
    await renderWithTheme(<Segmented accessibilityLabel="Status view" options={OPTIONS} value="hero" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'HERO' })).toHaveStyle({ backgroundColor: T['accent-glass'], borderColor: T['accent-border'] });
    expect(screen.getByText('HERO')).toHaveStyle({ color: T['accent-text'] });
    expect(screen.getByText('STATS')).toHaveStyle({ color: T['dim-flat'] });
  });

  it('recolours when the palette changes and keeps the same choice', async () => {
    await renderWithTheme(<Segmented accessibilityLabel="Status view" options={OPTIONS} value="stats" onChange={() => {}} />);
    await screen.rerender(
      <TestThemeProvider palette="jade">
        <Segmented accessibilityLabel="Status view" options={OPTIONS} value="stats" onChange={() => {}} />
      </TestThemeProvider>,
    );
    expect(screen.getByRole('radio', { name: 'STATS' })).toBeChecked();
    expect(screen.getByText('STATS')).toHaveStyle({ color: PALETTE_TOKENS.jade.dark['accent-text'] });
  });

  it('gives every segment the same width and at least 48dp of height', async () => {
    await renderWithTheme(<Segmented accessibilityLabel="Status view" options={OPTIONS} value="hero" onChange={() => {}} />);
    for (const name of ['HERO', 'STATS', 'WEEKLY']) {
      const style = StyleSheet.flatten(screen.getByRole('radio', { name }).props.style);
      expect(style.flex).toBe(1);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
    }
  });

  it('renders no segment as chosen when the value matches none', async () => {
    await renderWithTheme(<Segmented accessibilityLabel="Status view" options={OPTIONS} value="nope" onChange={() => {}} />);
    for (const name of ['HERO', 'STATS', 'WEEKLY']) expect(screen.getByRole('radio', { name })).not.toBeChecked();
  });
});
