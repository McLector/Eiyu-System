import { useTheme } from '@react-navigation/native';
import { cleanup, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDark = true;
jest.doMock('@/contexts/theme-store', () => ({ useAppTheme: () => ({ darkMode: mockDark }) }));
jest.doMock('expo-status-bar', () => {
  const { Text: MockText } = require('react-native');
  return { StatusBar: ({ style }: { style: string }) => <MockText>{`status:${style}`}</MockText> };
});

const { ThemedShell } = require('../eiyu/themed-shell') as typeof import('../eiyu/themed-shell');

function NavTheme() {
  return <Text>{`nav-dark:${useTheme().dark}`}</Text>;
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
});
