const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const routerRoot = path.dirname(require.resolve('expo-router/package.json'));

// A staged native build can use an additional dependency directory. Ordinary
// workspace builds retain Expo's automatic monorepo configuration.
const extraModules = process.env.EXPO_METRO_EXTRA_NODE_MODULES;
if (extraModules) {
  const modulesPath = path.resolve(extraModules);
  config.watchFolders = [...new Set([...config.watchFolders, modulesPath])];
  config.resolver.nodeModulesPaths = [...new Set([
    ...config.resolver.nodeModulesPaths,
    modulesPath,
  ])];
}

// Router entry and application imports must share the same context objects.
// Hierarchical resolution can otherwise select two installed router copies.
//
// The app entry is a file in this folder (index.ts registers the widget task handler). React Native's Gradle plugin hands
// Metro that entry relative to this folder ("index.ts"), but Metro resolves it from the server root, which is the monorepo
// root, so a release bundle cannot find it. Map that one request, and only from the server root, to the real file.
const appEntry = path.join(__dirname, require('./package.json').main);
const serverRoot = config.server && config.server.unstable_serverRoot;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromServerRoot = serverRoot && path.resolve(context.originModulePath) === path.resolve(serverRoot);
  const request = moduleName === 'expo-router'
    ? routerRoot
    : moduleName.startsWith('expo-router/')
      ? path.join(routerRoot, moduleName.slice('expo-router/'.length))
      : fromServerRoot && moduleName === `./${path.basename(appEntry)}`
        ? appEntry
        : moduleName;
  return context.resolveRequest(context, request, platform);
};

module.exports = config;
