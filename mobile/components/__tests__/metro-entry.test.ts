import path from 'node:path';

type Context = { originModulePath: string; resolveRequest: jest.Mock };

const mobileRoot = path.resolve(__dirname, '..', '..');
const mockServerRoot = path.resolve(__dirname, '..', '..', '..');

// Expo's real config pulls in ESM that jest cannot load; this is the shape it returns in this monorepo (server root = repo root).
jest.mock('expo/metro-config', () => ({
  getDefaultConfig: () => ({
    watchFolders: [],
    resolver: { nodeModulesPaths: [] },
    server: { unstable_serverRoot: mockServerRoot },
  }),
}));

function loadConfig() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../metro.config.js') as {
    server: { unstable_serverRoot?: string };
    resolver: { resolveRequest: (context: Context, moduleName: string, platform: string | null) => unknown };
  };
}

function resolve(moduleName: string, originModulePath: string) {
  const config = loadConfig();
  const context: Context = { originModulePath, resolveRequest: jest.fn(() => ({ type: 'sourceFile', filePath: 'resolved' })) };
  config.resolver.resolveRequest(context, moduleName, 'android');
  return { context, config };
}

// React Native's Gradle plugin passes the app entry relative to the app folder ("index.ts"), but Expo's Metro server root is the
// monorepo root, so Metro looks for ./index.ts there. The app entry must resolve to the app's own file from the server root.
describe('metro app entry from the server root', () => {
  it('resolves the bare ./index.ts entry to the app index when the origin is the server root', () => {
    const serverRoot = loadConfig().server.unstable_serverRoot ?? mobileRoot;
    const { context } = resolve('./index.ts', path.join(serverRoot, '.'));
    expect(context.resolveRequest).toHaveBeenCalledTimes(1);
    expect(context.resolveRequest.mock.calls[0][1]).toBe(path.join(mobileRoot, 'index.ts'));
  });

  it('leaves ./index.ts alone when it is imported from a real file', () => {
    const { context } = resolve('./index.ts', path.join(mobileRoot, 'lib', 'some-module.ts'));
    expect(context.resolveRequest.mock.calls[0][1]).toBe('./index.ts');
  });

  it('leaves other relative requests from the server root alone', () => {
    const serverRoot = loadConfig().server.unstable_serverRoot ?? mobileRoot;
    const { context } = resolve('./other.ts', path.join(serverRoot, '.'));
    expect(context.resolveRequest.mock.calls[0][1]).toBe('./other.ts');
  });

  it('still redirects expo-router to the single installed copy', () => {
    const { context } = resolve('expo-router', path.join(mobileRoot, 'app', '_layout.tsx'));
    const routerRoot = path.dirname(require.resolve('expo-router/package.json'));
    expect(context.resolveRequest.mock.calls[0][1]).toBe(routerRoot);
  });

  it('still redirects expo-router sub-paths to that copy', () => {
    const { context } = resolve('expo-router/entry', path.join(mobileRoot, 'index.ts'));
    const routerRoot = path.dirname(require.resolve('expo-router/package.json'));
    expect(context.resolveRequest.mock.calls[0][1]).toBe(path.join(routerRoot, 'entry'));
  });
});
