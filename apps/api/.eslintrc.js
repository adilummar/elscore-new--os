// @ts-check
const baseConfig = require('@elscore/config/eslint');

/** @type {import('eslint').Linter.Config} */
module.exports = {
  ...baseConfig,
  parserOptions: {
    project: ['./tsconfig.json', './tsconfig.test.json'],
    tsconfigRootDir: __dirname,
  },
  rules: {
    ...baseConfig.rules,
    // NestJS-specific overrides
    '@typescript-eslint/no-extraneous-class': 'off', // NestJS uses classes for modules
    '@typescript-eslint/no-unsafe-assignment': 'off', // Too noisy with decorators
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
  },
  overrides: [
    {
      // Test files: relax strictness on `any` usage and console for mocking patterns
      files: ['**/*.spec.ts', 'test/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        'no-console': 'off',
      },
    },
  ],
};

