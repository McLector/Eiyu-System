// Global Jest setup: the native AsyncStorage module is null under jest-expo's
// node test environment, so any suite whose import chain touches it (directly
// or via lib/ai.ts) crashes at import time. Provide an in-memory stand-in.
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  const makeImpl = () => ({
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
    getAllKeys: jest.fn(async () => Object.keys(store)),
  });
  return {
    __esModule: true,
    default: makeImpl(),
    useAsyncStorage: () => makeImpl(),
  };
});
// lib/ai.ts imports the real Supabase client, which hard-throws without env
// vars. Tests never hit the network - stub just what lib/ai.ts uses.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(async () => ({ data: null, error: null })),
    },
  },
}));

// Native modules added for the redesign (swipe pager, gym media). They need device code, so jest gets light stand-ins.
jest.mock('react-native-pager-view', () => {
  const React = require('react');
  const { View } = require('react-native');
  const PagerView = React.forwardRef(({ children, ...props }, ref) => React.createElement(View, { ref, ...props }, children));
  PagerView.displayName = 'PagerView';
  return { __esModule: true, default: PagerView, PagerView };
});
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true })),
  MediaTypeOptions: { All: 'All', Images: 'Images', Videos: 'Videos' },
}));
jest.mock('expo-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makePlayer = () => ({
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
    replace: jest.fn(),
    loop: false,
    muted: false,
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  });
  return {
    useVideoPlayer: jest.fn((source, setup) => {
      const player = makePlayer();
      if (setup) setup(player);
      return player;
    }),
    VideoView: props => React.createElement(View, props),
  };
});

// The home-screen widget library draws through native code. Its primitives become plain components that tests can
// compare by identity (the widget is inspected as a React element tree, not rendered), and its calls are spies.
jest.mock('react-native-android-widget', () => {
  const primitive = name => {
    const Component = () => null;
    Component.displayName = name;
    return Component;
  };
  return {
    FlexWidget: primitive('FlexWidget'),
    TextWidget: primitive('TextWidget'),
    OverlapWidget: primitive('OverlapWidget'),
    requestWidgetUpdate: jest.fn(async () => undefined),
    registerWidgetTaskHandler: jest.fn(),
  };
});

// The keyboard library is native; it ships its own jest mock (individual tests may still override it).
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));

// expo-application needs the native module; tests run as the production app. Suites that care mock it themselves.
jest.mock('expo-application', () => ({ applicationId: 'com.mclector.eiyusystem' }));
