# ESLint Comprehensive Lint Enhancement — Design Spec

**Date:** 2026-03-24
**Status:** Approved

## Overview

Add ESLint with full type-checked rules, `eslint-plugin-unicorn`, and `eslint-plugin-sonarjs` to World Monitor. Covers both the TypeScript frontend (`src/`) and the Node.js sidecar + scripts (`src-tauri/sidecar/`, `scripts/`, `api/`). All existing violations are fixed upfront — no suppressions, no warnings.

## Architecture

Single `eslint.config.mjs` at the repo root using ESLint 9 flat config format. Four stacked config blocks:

1. **Global ignores** — `node_modules/`, `dist/`, `src-tauri/target/`, `.agent/`, `src/workers/ml.worker.ts`
2. **TypeScript source** (`src/**/*.ts`) — full type-checked rules, parser pointed at `tsconfig.json`
3. **Sidecar + scripts** (`src-tauri/sidecar/**/*.mjs`, `scripts/**/*.mjs`, `api/**/*.mjs`) — recommended rules without type-checking, `console.*` allowed
4. **Test files** (`**/*.test.*`, `e2e/**`) — relaxed: `no-console` off, `sonarjs/cognitive-complexity` off, `unicorn/no-process-exit` off

## Packages

All added as `devDependencies`:

- `eslint@9`
- `typescript-eslint` (unified package — replaces separate `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser`)
- `eslint-plugin-unicorn`
- `eslint-plugin-sonarjs`
- `lint-staged`

## Rules

### TypeScript source (`src/**/*.ts`)

| Rule | Severity | Rationale |
|------|----------|-----------|
| `typescript-eslint/recommended-type-checked` | base | Full type-aware rules |
| `typescript-eslint/stylistic-type-checked` | base | Consistent type-level style |
| `@typescript-eslint/no-floating-promises` | error | Async calls must be awaited or voided |
| `@typescript-eslint/no-explicit-any` | error | No `any` bypassing strict types |
| `@typescript-eslint/no-misused-promises` | error | No async functions passed where void expected |
| `no-console` | error | No debug output in frontend builds |
| `no-restricted-syntax` (string `"localhost"`) | error | WKWebView only allows `127.0.0.1` |
| `unicorn/recommended` | base | Modern JS patterns |
| `sonarjs/recommended` | base | Cognitive complexity + bug patterns |

### Unicorn overrides (off)

| Rule | Reason |
|------|--------|
| `unicorn/prevent-abbreviations` | Codebase uses `el`, `btn`, `cfg` throughout |
| `unicorn/no-array-reduce` | Used extensively in data processing |
| `unicorn/filename-case` | Existing files use kebab-case (`ema-forecast.ts`) |

### Sidecar + scripts (`src-tauri/sidecar/**/*.mjs`, `scripts/**/*.mjs`, `api/**/*.mjs`)

- `typescript-eslint/recommended` (no type-checking — no tsconfig covers these files)
- `unicorn/recommended` + `sonarjs/recommended` (same overrides as above)
- `no-console: off` — server/CLI output is intentional
- `no-restricted-syntax` for `"localhost"` still enforced

### Test files (`**/*.test.*`, `e2e/**`)

- `no-console: off`
- `sonarjs/cognitive-complexity: off`
- `unicorn/no-process-exit: off`

## Scripts

```json
"lint": "eslint .",
"lint:fix": "eslint . --fix"
```

`lint` becomes a first-class quality gate alongside `typecheck:all`, `lint:md`, and `secrets:scan`.

## CI

New `eslint` job added to `.github/workflows/lint.yml`:

- Runs on all PRs (not path-filtered)
- `ubuntu-latest` + Node 22
- Runs `npm ci` then `npm run lint`

## Pre-commit Hook

`lint-staged` added to `package.json` config. The existing hook installer (`scripts/install-git-hooks.mjs`) updated to run `lint-staged` in the `pre-commit` hook alongside `secrets:scan:staged`.

`lint-staged` config:
```json
"lint-staged": {
  "*.{ts,mjs}": ["eslint --fix --quiet", "git add"]
}
```

Auto-fixes trivial violations on commit. Fails commit on anything requiring manual attention.

## Violation Fix Sequence

1. Install packages, write `eslint.config.mjs`
2. Run `eslint . --fix` — auto-fix majority (import style, prefer-const, unicorn idioms)
3. Run `eslint .` — surface remaining manual fixes
4. Fix manually, file by file: floating promises → explicit `any`s → cognitive complexity → `localhost` literals
5. `npm run typecheck:all` to verify no regressions
6. All gates green: `lint` + `typecheck:all` + `secrets:scan`

`sonarjs/cognitive-complexity` violations (functions over complexity 15) are refactored, not suppressed. These are the highest-value fixes.

## Success Criteria

- `npm run lint` exits 0 on a clean checkout
- `npm run typecheck:all` still exits 0
- CI `eslint` job required-check on PRs
- Pre-commit hook auto-fixes and blocks unfixable violations
- Zero `eslint-disable` comments in the codebase
