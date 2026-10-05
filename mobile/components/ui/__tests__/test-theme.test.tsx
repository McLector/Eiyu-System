import { render, screen } from '@testing-library/react-native';
import { PALETTE_TOKENS } from '@eiyu/shared';
import { Text } from 'react-native';

import { useTokens } from '@/contexts/theme-store';
import { renderWithTheme } from '../test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Accent() {
  return <Text>{useTokens().accent}</Text>;
}

describe('renderWithTheme', () => {
  it('defaults to the dark cyan palette', async () => {
    await renderWithTheme(<Accent />);
    expect(screen.getByText(PALETTE_TOKENS.cyan.dark.accent)).toBeTruthy();
  });

  it('renders under the palette and mode it is given', async () => {
    await renderWithTheme(<Accent />, { palette: 'jade', mode: 'light' });
    expect(screen.getByText(PALETTE_TOKENS.jade.light.accent)).toBeTruthy();
  });
});

describe('useTokens without a provider', () => {
  it('fails loudly instead of rendering undefined colours', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Accent />)).rejects.toThrow('useAppTheme must be used inside AppThemeProvider');
    errorSpy.mockRestore();
  });
});
