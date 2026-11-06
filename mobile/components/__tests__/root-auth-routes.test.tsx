import {render, screen} from '@testing-library/react-native';
import RootLayout from '../../app/_layout';
let mockSignedIn = false;
let mockGoogleUser = false;
const mockGateProps: {user: {id: string; app_metadata?: unknown}; onSignOut: unknown}[] = [];
jest.mock('expo-router', () => {
 const React = require('react'); const {View, Text} = require('react-native');
 const Stack = ({children}: {children: unknown}) => React.createElement(View, {}, children);
 Stack.displayName = 'Stack';
 const Screen = ({name}: {name: string}) => React.createElement(Text, {testID: 'available-route'}, name);
 Screen.displayName = 'Stack.Screen';
 Stack.Screen = Screen;
 const Protected = ({guard, children}: {guard: boolean; children: unknown}) => guard ? children : null;
 Protected.displayName = 'Stack.Protected';
 Stack.Protected = Protected;
 return {Stack};
});
jest.mock('expo-font', () => ({useFonts: () => [true]}));
jest.mock('expo-splash-screen', () => ({preventAutoHideAsync: jest.fn(), hideAsync: jest.fn()}));
jest.mock('@tanstack/react-query-persist-client', () => ({PersistQueryClientProvider: ({children}: {children: unknown}) => children}));
jest.mock('@/contexts/auth-store', () => ({AuthProvider: ({children}: {children: unknown}) => children, useAuth: () => ({loading: false, signOut: async () => ({error: null}), session: mockSignedIn ? {user: mockGoogleUser ? {id: 'owner', app_metadata: {provider: 'google'}} : {id: 'owner'}} : null})}));
jest.mock('@/components/eiyu/google-finish-gate', () => ({GoogleFinishGate: (props: {user: {id: string; app_metadata?: unknown}; onSignOut: unknown; children: unknown}) => {mockGateProps.push({user: props.user, onSignOut: props.onSignOut}); return props.children;}}));
jest.mock('@/contexts/eiyu-store', () => ({EiyuProvider: ({children}: {children: unknown}) => children, queryClient: {}, persister: {}}));
jest.mock('@/contexts/gym-store', () => ({GymProvider: ({children}: {children: unknown}) => children}));
jest.mock('@/contexts/theme-store', () => ({AppThemeProvider: ({children}: {children: unknown}) => children}));
jest.mock('@/components/eiyu/themed-shell', () => ({ThemedShell: ({children}: {children: unknown}) => children}));
jest.mock('@/components/eiyu/dev-ball', () => ({DevBall: () => null}));
jest.mock('@/lib/app-focus', () => ({installAppFocus: jest.fn()}));
jest.mock('@/lib/notification-taps', () => ({useNotificationTaps: jest.fn()}));

it.each([false, true])('keeps recovery reachable without making it the auth fallback (signed in: %s)', async signedIn => {
 mockSignedIn = signedIn; mockGoogleUser = false; await render(<RootLayout/>);
 const names = screen.getAllByTestId('available-route').map(node => node.props.children);
 expect(names).toContain('auth/recovery');
 expect(names[0]).toBe(signedIn ? '(tabs)' : 'auth');
 expect(names).not.toContain(signedIn ? 'auth' : '(tabs)');
});

// S03: a Google-created account is held at the finish screen before the signed-in stack opens.
describe('Google finish gate in the root layout', () => {
 it('passes the signed-in user and the sign-out handler to the gate', async () => {
  mockSignedIn = true; mockGoogleUser = true; mockGateProps.length = 0;
  await render(<RootLayout/>);
  expect(mockGateProps).toHaveLength(1);
  expect(mockGateProps[0].user).toMatchObject({id: 'owner', app_metadata: {provider: 'google'}});
  expect(typeof mockGateProps[0].onSignOut).toBe('function');
 });
 it('does not mount the gate when signed out', async () => {
  mockSignedIn = false; mockGoogleUser = false; mockGateProps.length = 0;
  await render(<RootLayout/>);
  expect(mockGateProps).toHaveLength(0);
 });
});
