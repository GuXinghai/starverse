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
      files: ['src/next/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@/ui-kit', '@/ui-kit/**', '**/*.vue'],
                message: 'src/next/** must not import UI (ui-kit/*.vue); keep domain/pipeline layer UI-free.',
              },
            ],
          },
        ],
      },
    },
  ],
}
