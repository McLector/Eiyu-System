import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

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

export default tseslint.config(
  { ignores: ['dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React 19 automatic JSX runtime — no import needed per file
      'react/prop-types': 'off', // TypeScript already enforces prop shapes
    },
    settings: { react: { version: 'detect' } },
  },
  noDeepSharedImports,
);
