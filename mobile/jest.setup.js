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