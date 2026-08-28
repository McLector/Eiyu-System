export interface EiyuTheme {
  text: string;
  muted: string;
  dim: string;
  accent: string;
  accentGlass: string;
  accentHover: string;
  accentBorder: string;
  accentStrong: string;
  glass: string;
  glassSm: string;
  glassBorder: string;
  track: string;
  modal: string;
  overlay: string;
  nav: string;
  navBorder: string;
  navDim: string;
  pageGradient: [string, string, string];
  body: string;
}

export const darkTheme: EiyuTheme = {
  text: '#dff0fb',
  muted: 'rgba(163, 210, 230, 0.55)',
  dim: 'rgba(163, 210, 230, 0.38)',
  accent: '#67e8f9',
  accentGlass: 'rgba(103, 232, 249, 0.08)',
  accentHover: 'rgba(103, 232, 249, 0.14)',
  accentBorder: 'rgba(103, 232, 249, 0.22)',
  accentStrong: 'rgba(103, 232, 249, 0.38)',
  glass: 'rgba(6, 22, 42, 0.65)',
  glassSm: 'rgba(6, 22, 42, 0.75)',
  glassBorder: 'rgba(103, 232, 249, 0.12)',
  track: 'rgba(6, 20, 40, 0.8)',
  modal: 'rgba(5, 18, 35, 0.97)',
  overlay: 'rgba(3, 13, 26, 0.85)',
  nav: 'rgba(4, 12, 22, 0.92)',
  navBorder: 'rgba(103, 232, 249, 0.1)',
  navDim: 'rgba(163, 210, 230, 0.35)',
  pageGradient: ['#040f1e', '#030c18', '#040e1c'],
  body: '#030d1a',
};

export const lightTheme: EiyuTheme = {
  text: '#0b1e32',
  muted: 'rgba(14, 52, 80, 0.55)',
  dim: 'rgba(14, 52, 80, 0.38)',
  accent: '#0891b2',
  accentGlass: 'rgba(8, 145, 178, 0.08)',
  accentHover: 'rgba(8, 145, 178, 0.14)',
  accentBorder: 'rgba(8, 145, 178, 0.22)',
  accentStrong: 'rgba(8, 145, 178, 0.38)',
  glass: 'rgba(255, 255, 255, 0.62)',
  glassSm: 'rgba(255, 255, 255, 0.78)',
  glassBorder: 'rgba(8, 145, 178, 0.2)',
  track: 'rgba(8, 145, 178, 0.1)',
  modal: 'rgba(237, 248, 255, 0.97)',
  overlay: 'rgba(180, 220, 245, 0.75)',
  nav: 'rgba(210, 240, 255, 0.92)',
  navBorder: 'rgba(8, 145, 178, 0.15)',
  navDim: 'rgba(14, 52, 80, 0.35)',
  pageGradient: ['#d6ebf8', '#e5f4ff', '#d4e9f6'],
  body: '#d6ebf8',
};

export const fonts = {
  display: 'Rajdhani_700Bold',
  displaySemi: 'Rajdhani_600SemiBold',
  displayMed: 'Rajdhani_500Medium',
  body: 'Inter_400Regular',
  bodyMed: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
  monoSemi: 'JetBrainsMono_600SemiBold',
};
