import { render, type RenderResult } from '@testing-library/react-native';
import { PALETTE_TOKENS, type Palette, type ThemeMode } from '@eiyu/shared';
import type { ReactElement, ReactNode } from 'react';

import { buildEiyuTheme } from '@/constants/palette-theme';
import { ThemeContext } from '@/contexts/theme-store';

/** Test stand-in for AppThemeProvider: same value shape, no storage and no account. */
export function TestThemeProvider({ children, mode = 'dark', palette = 'cyan' }: { children: ReactNode; mode?: ThemeMode; palette?: Palette }) {
  return (
    <ThemeContext.Provider
      value={{
        mode,
        palette,
        darkMode: mode === 'dark',
        theme: buildEiyuTheme(mode, palette),
        tokens: PALETTE_TOKENS[palette][mode],
        setMode: () => {},
        setPalette: () => {},
      }}>
      {children}
    </ThemeContext.Provider>
  );
}

export async function renderWithTheme(ui: ReactElement, options: { mode?: ThemeMode; palette?: Palette } = {}): Promise<RenderResult> {
  return await render(<TestThemeProvider mode={options.mode} palette={options.palette}>{ui}</TestThemeProvider>);
}
