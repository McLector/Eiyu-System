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
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const request = moduleName === 'expo-router'
    ? routerRoot
    : moduleName.startsWith('expo-router/')
      ? path.join(routerRoot, moduleName.slice('expo-router/'.length))
      : moduleName;
  return context.resolveRequest(context, request, platform);
};

module.exports = config;
