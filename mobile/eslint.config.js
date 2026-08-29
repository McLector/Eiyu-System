const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

const noDeepSharedImports = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@eiyu/shared/*'],
            message:
              "Import from '@eiyu/shared' directly — deep imports into its internals bypass the package's public API.",
          },
        ],
      },
    ],
  },
};

module.exports = defineConfig([
  ...expoConfig,
  { ignores: ['.expo/**', 'android/**', 'ios/**'] },
  noDeepSharedImports,
]);
