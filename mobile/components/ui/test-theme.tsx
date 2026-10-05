import { render, type RenderResult } from '@testing-library/react-native';
import { PALETTE_TOKENS, type Palette, type ThemeMode } from '@eiyu/shared';
import type { ReactElement, ReactNode } from 'react';

import { ThemeContext } from '@/contexts/theme-store';

/** Test stand-in for AppThemeProvider: same value shape, no storage and no account. */
export function TestThemeProvider({ children, mode = 'dark', palette = 'cyan', setMode = () => {}, setPalette = () => {} }: {
  children: ReactNode;
  mode?: ThemeMode;
  palette?: Palette;
  setMode?: (mode: ThemeMode) => void;
  setPalette?: (palette: Palette) => void;
}) {
  return (
    <ThemeContext.Provider
      value={{
        mode,
        palette,
        darkMode: mode === 'dark',
        tokens: PALETTE_TOKENS[palette][mode],
        setMode,
        setPalette,
      }}>
      {children}
    </ThemeContext.Provider>
  );
}

export async function renderWithTheme(ui: ReactElement, options: { mode?: ThemeMode; palette?: Palette; setMode?: (mode: ThemeMode) => void; setPalette?: (palette: Palette) => void } = {}): Promise<RenderResult> {
  return await render(<TestThemeProvider {...options}>{ui}</TestThemeProvider>);
}
