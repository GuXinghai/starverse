/* eslint-env node */

module.exports = {
  root: true,
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    '@typescript-eslint/no-var-requires': 'off',
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
      rules: {
        // ======== ANTI-REGRESSION: Forbid object-reference comparison on activeStream ========
        // This prevents the JavaScript object-reference trap that caused buttons to stay disabled.
        // Always use activeAssistantMessageId (computed) for identity checks instead.
        'no-restricted-syntax': [
          'error',
          {
            selector: "BinaryExpression[operator='==='][left.object.name='activeStream'][left.property.name='value']",
            message: '❌ Do not compare activeStream.value with ===. Use activeAssistantMessageId instead.',
          },
          {
            selector: "BinaryExpression[operator='==='][right.object.name='activeStream'][right.property.name='value']",
            message: '❌ Do not compare activeStream.value with ===. Use activeAssistantMessageId instead.',
          },
          {
            selector: "BinaryExpression[operator='!=='][left.object.name='activeStream'][left.property.name='value']",
            message: '❌ Do not compare activeStream.value with !==. Use activeAssistantMessageId instead.',
          },
          {
            selector: "BinaryExpression[operator='!=='][right.object.name='activeStream'][right.property.name='value']",
            message: '❌ Do not compare activeStream.value with !==. Use activeAssistantMessageId instead.',
          },
        ],
      },
    },
    {
      files: ['**/*.{ts,tsx,vue}'],
      rules: {
        // Complexity guardrails (Phase 1.2): start as warnings for gradual rollout.
        'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
        complexity: ['warn', 20],
        'max-depth': ['warn', 4],
        'max-params': ['warn', 6],
        'max-statements': ['warn', 50],
      },
    },
    {
      files: ['**/*.{ts,tsx}'],
      excludedFiles: ['src/next/state/reducerAdapter.ts'],
      rules: {
        // reducerAdapter no longer uses persistent merger cache.
        // Keep placeholders export-compatible only; forbid adding new call-sites.
        'no-restricted-syntax': [
          'error',
          {
            selector: "CallExpression[callee.name='clearReasoningMerger']",
            message: 'clearReasoningMerger is a compatibility no-op; do not add new calls.',
          },
          {
            selector: "CallExpression[callee.name='clearAllReasoningMergers']",
            message: 'clearAllReasoningMergers is a compatibility no-op; do not add new calls.',
          },
        ],
      },
    },
    {
      // TEMP COMPLEXITY EXCEPTIONS (historical debt):
      // These files are already large/high-complexity and are tracked explicitly to avoid hidden debt.
      // Follow-up: split by responsibility boundaries (UI orchestration / IPC transport / DB worker handlers).
      files: [
        'src/ui-app/AppChatApp.vue',
        'infra/db/worker.ts',
        'src/next/state/reducer.ts',
        'electron/ipc/openRouterStreamBridge.ts',
      ],
      rules: {
        // Keep depth/params guardrails, but relax hot legacy bottlenecks first.
        'max-lines-per-function': ['warn', { max: 700, skipBlankLines: true, skipComments: true }],
        complexity: ['warn', 200],
        'max-statements': ['warn', 700],
      },
    },
    {
      files: ['src/ui-kit/**/*.{ts,tsx,js,jsx,mjs,cjs,vue}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@/next',
                  '@/next/**',
                  '../next/**',
                  '../../next/**',
                  '../../../next/**',
                  '../src/next/**',
                  '../../src/next/**',
                  '../../../src/next/**',
                  'src/next/**',
                ],
                message: 'src/ui-kit/** must not import src/next/** directly. Use adapter/contract layer or approved boundary exception.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['electron/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@/next',
                  '@/next/**',
                  '../src/next/**',
                  '../../src/next/**',
                  '../../../src/next/**',
                  'src/next/**',
                ],
                message: 'electron/** must not import src/next/** directly. Route through adapter/contract layer or approved boundary exception.',
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
                group: [
                  '@/ui-kit',
                  '@/ui-kit/**',
                  '@/ui-app',
                  '@/ui-app/**',
                  '../ui-kit/**',
                  '../../ui-kit/**',
                  '../../../ui-kit/**',
                  '../ui-app/**',
                  '../../ui-app/**',
                  '../../../ui-app/**',
                  '**/*.vue',
                ],
                message: 'src/next/** must not import UI layers (ui-kit/ui-app/*.vue); keep domain/pipeline layer UI-free.',
              },
            ],
          },
        ],
      },
    },
  ],
}
