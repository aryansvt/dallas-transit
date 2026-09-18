import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      'apps/web/**',
      'data/**',
      '.codex-log/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
];
