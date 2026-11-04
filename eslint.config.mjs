import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'backend/**', 'frontend/**', 'apps/api/prisma/migrations/**', 'deploy/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts', '*.config.*', 'apps/*/*.config.*'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Foundation code must not know about reviews, so the POC starter can later be made by deleting them.
    files: [
      'apps/api/src/lib/**',
      'apps/api/src/config/**',
      'apps/api/src/plugins/**',
      'apps/api/src/jobs/**',
      'apps/api/src/providers/email/**',
      'apps/api/src/providers/google-identity/**',
      'apps/api/src/modules/auth/**',
      'apps/api/src/modules/workspaces/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/modules/reviews/**', '**/modules/google/**', '**/providers/gbp/**'],
              message: 'Foundation code must not import product modules. Register a hook instead.',
            },
          ],
        },
      ],
    },
  },
);
