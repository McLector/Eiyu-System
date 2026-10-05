import { useTheme } from '@react-navigation/native';
import { cleanup, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { PALETTE_TOKENS } from '@eiyu/shared';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDark = true;
let mockPalette = 'cyan';
jest.doMock('@/contexts/theme-store', () => {
  const { PALETTE_TOKENS: tokens } = jest.requireActual('@eiyu/shared');
  return { useAppTheme: () => ({ darkMode: mockDark, tokens: tokens[mockPalette][mockDark ? 'dark' : 'light'] }) };
});
const mockSetBackground = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
jest.doMock('expo-system-ui', () => ({ setBackgroundColorAsync: (color: string) => mockSetBackground(color) }));
jest.doMock('expo-status-bar', () => {
  const { Text: MockText } = require('react-native');
  return { StatusBar: ({ style }: { style: string }) => <MockText>{`status:${style}`}</MockText> };
});

const { ThemedShell } = require('../eiyu/themed-shell') as typeof import('../eiyu/themed-shell');

function NavTheme() {
  return <Text>{`nav-dark:${useTheme().dark}`}</Text>;
}

function NavColors() {
  const { colors } = useTheme();
  return <Text>{`bg:${colors.background}|card:${colors.card}|border:${colors.border}|text:${colors.text}|primary:${colors.primary}`}</Text>;
}

afterEach(cleanup);

describe('ThemedShell', () => {
  it('draws light status-bar icons and the dark navigation theme in dark mode', async () => {
    mockDark = true;
    await render(<ThemedShell><NavTheme /></ThemedShell>);
    expect(screen.getByText('status:light')).toBeTruthy();
    expect(screen.getByText('nav-dark:true')).toBeTruthy();
  });

  it('draws dark status-bar icons and the light navigation theme in light mode, whatever the phone itself is set to', async () => {
    mockDark = false;
    await render(<ThemedShell><NavTheme /></ThemedShell>);
    expect(screen.getByText('status:dark')).toBeTruthy();
    expect(screen.getByText('nav-dark:false')).toBeTruthy();
  });

  it('renders its children', async () => {
    mockDark = true;
    await render(<ThemedShell><Text>inside</Text></ThemedShell>);
    expect(screen.getByText('inside')).toBeTruthy();
  });

  it('paints the navigation background, header, border and text from the palette tokens, not the stock navigation colours', async () => {
    mockDark = false;
    mockPalette = 'jade';
    const t = PALETTE_TOKENS.jade.light;
    await render(<ThemedShell><NavColors /></ThemedShell>);
    expect(screen.getByText(`bg:${t['page-flat']}|card:${t.nav}|border:${t['nav-border']}|text:${t.text}|primary:${t.accent}`)).toBeTruthy();
    mockPalette = 'cyan';
  });

  it('paints the root window background with the page colour so no stock colour shows behind the keyboard or a transition', async () => {
    mockDark = true;
    mockPalette = 'violet';
    mockSetBackground.mockClear();
    await render(<ThemedShell><Text>inside</Text></ThemedShell>);
    expect(mockSetBackground).toHaveBeenCalledWith(PALETTE_TOKENS.violet.dark['page-flat']);
    mockPalette = 'cyan';
  });

  it('does not crash when the phone refuses the background change', async () => {
    mockDark = true;
    mockSetBackground.mockReturnValueOnce(Promise.reject(new Error('no window')));
    await render(<ThemedShell><Text>still here</Text></ThemedShell>);
    expect(screen.getByText('still here')).toBeTruthy();
  });
});
