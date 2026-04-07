# World Monitor — Claude Code Context

## Project Overview

- **App name**: World Monitor (do NOT call this "Crystal Ball" — that is a separate project)
- **Bundle ID**: `com.bradleybond.worldmonitor`
- **Fork of**: `koala73/worldmonitor` by Elie Habib (AGPL-3.0)
- **Stack**: Tauri 2 + TypeScript + Vite + DeckGL + Node.js sidecar (port 46123)

## Commands

```bash
npm run desktop:build:full   # full production build
npm run typecheck:all        # type-check both tsconfig.json + tsconfig.api.json (must stay at zero errors)
npm run dev                  # vite dev server (web only, no Tauri)
npm run release:prepare -- --bump patch --push   # only supported release path
```
Install built app: copy `src-tauri/target/release/bundle/macos/World Monitor.app` to `~/Applications/World Monitor.app`.

## CANONICAL REPO — SINGLE SOURCE OF TRUTH (MANDATE)

There is exactly ONE place to develop this app:
```
~/developer/worldmonitor
```

- **Never** build, commit, or make changes in any other clone (e.g. `~/Documents/GitHub/worldmonitor-macos/` or the old iCloud clone)
- **Never** install to `/Applications` from any other build directory
- Always install from: `src-tauri/target/release/bundle/macos/World Monitor.app` in this directory
- The Dock and Spotlight should point to `~/Applications/World Monitor.app` only

If a second clone is found, DELETE it. Do not merge from it without explicit user instruction.

## Git Remotes

- `upstream` — Elie's repo, **fetch only** (push URL = `no_push`)
- `macos` — `bradleybond512/worldmonitor-macos` — **always push here**
- `crystal-ball` — alternate, do not use unless asked

Always commit with: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

## Branch Discipline (MANDATORY for every session)

**Never commit directly to local `main`.** Every session — Claude, Codex, or otherwise — must follow this flow:

```bash
git fetch macos
git checkout -b claude/your-feature-name macos/main  # or codex/your-feature-name
# ... do work, commit freely on the branch ...
git push macos claude/your-feature-name
# open a PR → auto-merge lands it
```

- Branch names: `claude/*` for Claude sessions, `codex/*` for Codex sessions
- Local `main` should only ever be fast-forwarded to `macos/main`, never developed on directly
- If you find yourself on `main` with uncommitted changes, stash or commit them, then move to a branch before pushing
- **Why**: Direct commits to local `main` diverge from `macos/main` (which only accepts PRs), causing messy reconciliation across sessions

## Release Management

- Desktop publishing is **tag-driven**, not `main`-push-driven. Never treat `git push macos main` as a release.
- The only supported release flow is `npm run release:prepare -- --bump patch|minor|major --push` or `--version X.Y.Z --push`.
- `release:prepare` must run from a clean `main` worktree. It bumps `package.json`, syncs `package-lock.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`, and `Info.plist`, runs `version:check` and `typecheck:all`, commits, creates annotated release tags, and optionally pushes.
- Release tags are:
  - `vX.Y.Z` for `full`
  - `vX.Y.Z-tech` for `tech`
  - `vX.Y.Z-finance` for `finance`
- `Build Desktop App` publishes only from `v*` tags. `workflow_dispatch` is build-only and must not be used as a substitute for a release.
- Release artifacts are verified by manifest. The workflow generates per-platform manifests, uploads a consolidated `release-manifest.json`, and re-downloads the uploaded assets to verify filenames and checksums.
- The app’s Settings view exposes build identity. Use it to confirm version, variant, release tag, commit SHA, and build timestamp when debugging mismatched installs.
- Agent branches (`claude/*`, `codex/*`, `copilot/*`) must use GitHub auto-merge after required checks pass. Never call the direct PR merge API to bypass the gate stack.
- `main` to local Mac sync is handled by a local LaunchAgent installed with `npm run main-sync:setup`.
- The sync agent uses a dedicated clean clone at `~/.worldmonitor-main-sync/repo`, verifies that GitHub required checks for `main` are green, then reruns `lockfile:check`, `npm ci`, `version:check`, `typecheck:all`, `build`, and `desktop:build:app:full` before installing with `node scripts/install-built-app.mjs --relaunch`.
- Inspect `~/.worldmonitor-main-sync/status.json` and `~/.worldmonitor-main-sync/logs/` when the Mac install lags behind `main`.
- If `scripts/sync-main-to-mac.mjs` or `scripts/setup-main-sync-agent.mjs` changes, rerun `npm run main-sync:setup`.
- GitHub release governance expectations:
  - `main` must keep passing `release-integrity`, `typecheck`, and CodeQL before merge
  - desktop publish job runs in the `release` environment
  - release tags must be treated as immutable once created
- If GitHub policy and local repo files drift, fix the policy gap as well; do not only patch the repo.

## Architecture

```
src/                        # TypeScript frontend (Vite)
  app/
    panel-layout.ts         # panel instantiation + sidebar layout
    data-loader.ts          # data fetching, task scheduling
    refresh-scheduler.ts    # scheduleRefresh() — ghost multiplier + hidden×10 + jitter
    event-handlers.ts       # UI events, keyboard shortcuts
  components/
    Panel.ts                # base Panel class (getContentElement() is public)
    RadiationDecayPanel.ts  # offline; disabled by default
    ResourceInventoryPanel.ts # offline; disabled by default
  config/
    panels.ts               # FULL_PANELS, PANEL_CATEGORY_MAP, FULL_MAP_LAYERS
  services/
    mode-manager.ts         # AppMode: peace/finance/war/disaster/ghost
    runtime-config.ts       # API key definitions, feature toggles
    settings-constants.ts   # HUMAN_LABELS, SIGNUP_URLS, SETTINGS_CATEGORIES
    analytics.ts            # PostHog (suppressed in Ghost Mode)
    cyber-extra.ts          # ThreatFox, OpenPhish, Spamhaus, CISA KEV
    ema-forecast.ts         # rolling 24-session EMA threat forecast
  styles/
    main.css
    macos-native.css        # sidebar, mode themes, Ghost Mode crimson/violet
src-tauri/
  sidecar/local-api-server.mjs  # Node.js API proxy, port 46123
  capabilities/default.json     # Tauri capability allowlist
  src/main.rs                   # 25 SUPPORTED_SECRET_KEYS (include THREATFOX_API_KEY)
```

## App Modes (`src/services/mode-manager.ts`)

| Mode | Trigger |
|------|---------|
| Peace | default |
| Finance | S&P500 ≥2.5% OR BTC ≥5% OR Oil ≥4% OR Gold ≥2% |
| War | ≥2 war signals > confidence 0.6 (normalized by conflict baselines) |
| Disaster | GDACS Red OR 3+ Orange OR M≥6.5 quake |
| Ghost | Manual only — ⌘⇧G / sidebar / File menu |

Ghost Mode: polling ×5, analytics suppressed, notifications suppressed, dark crimson sidebar, 👻 title.

## God's Eye HUD

`src/components/GlobeHUD.ts` overlay (built when entering God's Eye). State pumped at ~10fps from `GodsEyeView.ts` via `hud.updateState({...})`. Top-left threat card carries: clock (local TZ via `Intl.DateTimeFormat`), mode badge, threat assessment, HOTSPOTS / ALT / CONFLICT / DISASTER stat pills, coords, LOCAL HH:MM at camera longitude + sun-phase badge (DAY/GOLDEN/CIVIL/NAUTICAL/ASTRO/NIGHT), nearest hotspot card, top-5 alert list. Top-center has a scrolling LIVE ticker built from `getTopAlerts(8)`. Bottom-center is the layer-toggle bar; bottom-right is auto-follow (offset 80px to clear the time-machine scrubber at 84px).

**No finance/markets data on God's Eye** — explicit user mandate. Conflict counts come from `getCategoryCounts()` (`conflicts` + `airstrikes`); disaster counts from `gdacs` + `cyclones` + `earthquakes` + `fires`. Nearest hotspot is haversine over the `hotspots` layer's entity positions (`getNearestHotspot(lat, lon)`).

The magenta-globe regression has bitten us twice. Root cause both times: `loadWeatherSatellite()` in `GlobeDataManager.ts` adds an Iowa State TMS overlay (`goes_conus_geocolor`) that returns "Invalid TMS Request" pink PNGs for every tile. The function is currently a no-op stub — re-enable only when `satellite-weather.ts` has a working tile source. Original fix: commit `44a56901`. The base imagery (NASA GIBS Blue Marble in `CesiumGlobe.ts`) is unrelated.

## CSP Posture

`script-src` includes `'unsafe-eval'`. Required by Cesium (God's Eye 3D globe) for shader compilation. PR #170 attempted to remove it as a security hardening, which broke God's Eye entirely (silent dynamic-import failure → vault reload loop). Do not remove `'unsafe-eval'` without first replacing Cesium with a non-eval globe library. Compensating defenses: trusted-window IPC gating, sidecar bearer auth, no `'unsafe-inline'` on script-src, devtools disabled in production.

## Tauri 2 / WKWebView Gotchas

- **Window drag**: CSS `-webkit-app-region: drag` does NOT work — use JS `mousedown` → `tryInvokeTauri('plugin:window|start_dragging')`. Requires `core:window:allow-start-dragging` in `capabilities/default.json` (not in `core:default`).
- **Local iframes**: Always `http://127.0.0.1:{port}`, never `localhost` — CSP only allows `127.0.0.1`, WKWebView treats them as distinct origins. Use `getApiBaseUrl()` from `runtime.ts`.
- **YouTube sidecar**: `origin` in playerVars must match actual page URL (`http://127.0.0.1:{port}`).
- **Devtools**: Use `--features devtools` flag during dev (NOT in default features — removed from production builds). e.g. `cargo tauri dev --features devtools` → Safari > Develop > World Monitor.

## Legacy Internal Identifiers (do not change)

- `localStorage` keys stay `worldmonitor-*` (changing breaks existing user data)
- IndexedDB stays `worldmonitor_db`
- `KEYRING_SERVICE = "world-monitor"` (changing breaks keychain entries)
- `worldmonitor.app` domain refs kept (upstream cloud services)

## Settings / API Keys

- API keys entered via gear icon → API Keys tab (not in `FULL_PANELS`)
- `radiation-decay` and `resource-inventory` default `enabled: false`, priority 3
- `cyberThreats: true` in `FULL_MAP_LAYERS`, `VITE_ENABLE_CYBER_LAYER=true` in `.env.local`
- `SUPPORTED_SECRET_KEYS` in `main.rs` = 25 keys (THREATFOX_API_KEY is #25)

## Known Issues

- **Sector Heatmap**: Yahoo Finance blocked → needs Finnhub API key
- **Fires panel**: Needs `NASA_FIRMS_API_KEY`
- **Stablecoins**: "The string did not match the expected pattern" — WKWebView URL handling

## Secret Scan Guardrail

- This is a user-owned repo on GitHub, so non-provider patterns and validity checks are unavailable.
- The compensating control is mandatory repo secret scan enforcement in hooks and CI. Keep `npm run secrets:scan:staged` and `npm run secrets:scan` active and passing.
