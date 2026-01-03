import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['main.js', 'node_modules/**', '*.js', '*.mjs'],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
    plugins: {
      obsidianmd,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // Disable overly strict unsafe rules (not required by ObsidianReviewBot)
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // Obsidian plugin rules
      'obsidianmd/settings-tab/no-problematic-settings-headings': 'error',
      'obsidianmd/no-static-styles-assignment': 'error',
      'obsidianmd/ui/sentence-case': ['error', { enforceCamelCaseLower: true }],
      'obsidianmd/platform': 'error',
      'obsidianmd/regex-lookbehind': 'error',
      // Additional strict rules
      'no-case-declarations': 'error',
      'no-useless-escape': 'error',
    },
  },
);
