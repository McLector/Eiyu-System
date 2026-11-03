import { render, type RenderResult } from '@testing-library/react-native';
import { PALETTE_TOKENS, type Palette, type ThemeMode } from '@eiyu/shared';
import type { ReactElement, ReactNode } from 'react';

import { FontScaleNudgeProvider } from '@/contexts/font-scale-nudge';
import { ThemeContext } from '@/contexts/theme-store';

/** Test stand-in for AppThemeProvider (plus the root FontScaleNudgeProvider): same value shape, no storage and no account. */
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
      <FontScaleNudgeProvider>{children}</FontScaleNudgeProvider>
    </ThemeContext.Provider>
  );
}

export async function renderWithTheme(ui: ReactElement, options: { mode?: ThemeMode; palette?: Palette; setMode?: (mode: ThemeMode) => void; setPalette?: (palette: Palette) => void } = {}): Promise<RenderResult> {
  return await render(<TestThemeProvider {...options}>{ui}</TestThemeProvider>);
}
