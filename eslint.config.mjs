// @ts-check
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import sonarjs from 'eslint-plugin-sonarjs';

export default tseslint.config(
  // Block 1: Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'src-tauri/target/**',
      '.agent/**',
      'src/workers/ml.worker.ts',
      'src/generated/**',
      'convex/**',
    ],
  },

  // Block 2: TypeScript source — full type-checked rules
  {
    files: ['src/**/*.ts'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    plugins: {
      unicorn,
      sonarjs,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/localhost/]",
          message: "Use 127.0.0.1 instead of localhost — WKWebView treats them as distinct origins.",
        },
      ],
      ...unicorn.configs.recommended.rules,
      ...sonarjs.configs.recommended.rules,
      // Unicorn overrides
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/filename-case': 'off',
      // Disabled: auto-fix is type-unsafe or targets ES2021+/ES2022+/ES2023+ above tsconfig ES2020
      'unicorn/prefer-query-selector': 'off',       // querySelector returns Element (not HTMLElement)
      'unicorn/prefer-string-replace-all': 'off',   // replaceAll requires ES2021
      'unicorn/prefer-at': 'off',                   // .at() requires ES2022
      'unicorn/prefer-dom-node-dataset': 'off',     // dataset missing on Element; only on HTMLElement
      'unicorn/prefer-native-coercion-functions': 'off', // strips TS type-guard predicates in .filter()
      'unicorn/prefer-switch': 'off',               // switch conversion exposes invalid case values (TS error)
      'unicorn/prefer-array-find': 'off',           // checkFromLast introduces findLast (ES2023)
      'unicorn/explicit-length-check': 'off',       // `> 0` breaks string-length truthiness checks
      'unicorn/no-useless-undefined': 'off',        // removes .reduce() initial value, breaking TS inference
      'unicorn/prefer-global-this': 'off',          // globalThis lacks window's index signature for YT, onYouTubeIframeAPIReady, etc.
      'unicorn/no-array-for-each': 'off',           // for..of on optional-chained NodeList results in TS error (undefined is not iterable)
      '@typescript-eslint/no-unnecessary-type-assertion': 'off', // removes casts that narrow Element→HTMLElement (required by downstream TS)
      '@typescript-eslint/non-nullable-type-assertion-style': 'off', // converts `as HTMLInputElement` to `!`, losing the type narrowing
    },
  },

  // Block 3: Sidecar + scripts — no type-checking
  {
    files: [
      'src-tauri/sidecar/**/*.mjs',
      'scripts/**/*.mjs',
      'api/**/*.js',
    ],
    extends: [
      ...tseslint.configs.recommended,
    ],
    plugins: {
      unicorn,
      sonarjs,
    },
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/localhost/]",
          message: "Use 127.0.0.1 instead of localhost — WKWebView treats them as distinct origins.",
        },
      ],
      ...unicorn.configs.recommended.rules,
      ...sonarjs.configs.recommended.rules,
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/filename-case': 'off',
      // Disabled: auto-fix targets ES2021+/ES2022+/ES2023+ above tsconfig ES2020, or is type-unsafe
      'unicorn/prefer-string-replace-all': 'off',   // replaceAll requires ES2021
      'unicorn/prefer-at': 'off',                   // .at() requires ES2022
      'unicorn/prefer-array-find': 'off',           // checkFromLast introduces findLast (ES2023)
      'unicorn/prefer-switch': 'off',               // switch conversion can expose invalid case values
      'unicorn/explicit-length-check': 'off',       // `> 0` breaks truthiness checks on non-number types
      'unicorn/no-useless-undefined': 'off',        // removes .reduce() initial value
    },
  },

  // Block 4: Test files — relaxed rules
  {
    files: ['**/*.test.*', 'e2e/**'],
    rules: {
      'no-console': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'unicorn/no-process-exit': 'off',
    },
  },
);
