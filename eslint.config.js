import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

/** Flat config for the three runtimes this package ships:
 * - `lib/index.js` + `lib/vite.js` run in the Harness host process (Node);
 * - `lib/client.js` runs in the Harness Web client;
 * - `lib/bridge.js` runs inside the visited page, so it may only use browser globals.
 */
export default [
  {
    ignores: [
      'lib/**',
      'integration/**',
      'node_modules/**',
      '.host-source/**',
      'docs/harness-browser-annotation.patch',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
  {
    // The picker and the Client half both live in a browser.
    files: ['src/browser/**/*.ts', 'src/client/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['tests/**/*.ts', 'examples/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // These two scripts drive a real browser: their `page.evaluate` bodies are browser
    // code evaluated in the page, so both global sets are legitimate in one file.
    files: [
      'scripts/annotation-acceptance.mjs',
      'scripts/annotation-storage-acceptance.mjs',
    ],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    rules: {
      // `_`-prefixed names are the repository's deliberate "intentionally unused" spelling.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  eslintConfigPrettier,
];
