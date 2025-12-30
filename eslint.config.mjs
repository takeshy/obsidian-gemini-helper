import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['main.js', 'node_modules/**'],
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      obsidianmd,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // Obsidian plugin rules
      'obsidianmd/settings-tab/no-problematic-settings-headings': 'error',
      'obsidianmd/no-static-styles-assignment': 'error',
      'obsidianmd/ui/sentence-case': ['error', { enforceCamelCaseLower: true }],
      'obsidianmd/platform': 'error',
      'obsidianmd/regex-lookbehind': 'error',
    },
  },
];
