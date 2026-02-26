import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['main.js', 'node_modules/**', '*.js', '*.mjs', 'vitest.config.ts', 'src/**/*.test.ts'],
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

      // Obsidian plugin rules (from recommended config)
      'obsidianmd/commands/no-command-in-command-id': 'error',
      'obsidianmd/commands/no-command-in-command-name': 'error',
      'obsidianmd/commands/no-default-hotkeys': 'error',
      'obsidianmd/commands/no-plugin-id-in-command-id': 'error',
      'obsidianmd/commands/no-plugin-name-in-command-name': 'error',
      'obsidianmd/settings-tab/no-manual-html-headings': 'error',
      'obsidianmd/settings-tab/no-problematic-settings-headings': 'error',
      'obsidianmd/vault/iterate': 'error',
      'obsidianmd/detach-leaves': 'error',
      'obsidianmd/hardcoded-config-path': 'error',
      'obsidianmd/no-forbidden-elements': 'error',
      'obsidianmd/no-plugin-as-component': 'error',
      'obsidianmd/no-sample-code': 'error',
      'obsidianmd/no-tfile-tfolder-cast': 'error',
      'obsidianmd/no-view-references-in-plugin': 'error',
      'obsidianmd/no-static-styles-assignment': 'error',
      'obsidianmd/object-assign': 'error',
      'obsidianmd/platform': 'error',
      'obsidianmd/prefer-file-manager-trash-file': 'warn',
      'obsidianmd/prefer-abstract-input-suggest': 'error',
      'obsidianmd/regex-lookbehind': 'error',
      'obsidianmd/sample-names': 'error',
      'obsidianmd/validate-manifest': 'error',
      'obsidianmd/validate-license': 'error',
      'obsidianmd/ui/sentence-case': 'error',
      'obsidianmd/ui/sentence-case-locale-module': 'error',

      // Additional strict rules
      'no-case-declarations': 'error',
      'no-useless-escape': 'error',
    },
  },
);
