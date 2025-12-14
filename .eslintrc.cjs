/* eslint-env node */

module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'dist-electron/',
    'release/',
    'public/',
    'docs/',
    'archived-components/',
    'archived-services/',
  ],
  overrides: [
    {
      files: ['**/*.cjs'],
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script',
      },
    },
    {
      files: ['**/*.{ts,tsx,d.ts}'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    {
      files: ['**/*.vue'],
      parser: 'vue-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser',
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    {
      files: ['src/ui-next/**/*.{ts,tsx,vue}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  // Legacy surfaces (removed in TC-12); keep as hard guardrail to prevent reintroduction.
                  '@/(stores|services|components|composables|utils|types)',
                  '@/(stores|services|components|composables|utils|types)/**',
                ],
                message:
                  'ui-next must not import legacy UI/store/service surfaces; use src/next/** + facade/hooks + ui-kit only.',
              },
              {
                group: [
                  // Prevent reaching archived legacy code via relative imports.
                  '../archived-components/**',
                  '../archived-services/**',
                  '../../archived-components/**',
                  '../../archived-services/**',
                  '../../../archived-components/**',
                  '../../../archived-services/**',
                ],
                message: 'ui-next must not import archived legacy code.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/next/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@/ui-next', '@/ui-next/**', '@/ui-kit', '@/ui-kit/**', '**/*.vue'],
                message: 'src/next/** must not import UI (ui-next/ui-kit/*.vue); keep domain/pipeline layer UI-free.',
              },
            ],
          },
        ],
      },
    },
  ],
}
