# Architecture

World Monitor is a single-repo desktop app that ships a thin Rust shell, a Node.js sidecar, and a Vite-bundled TypeScript frontend. There is one canonical workspace at `~/Developer/worldmonitor` and one set of remotes (see `CLAUDE.md` for branch and release conventions).

## Component diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Tauri 2 Rust shell                          │
│  • Window + lifecycle (src-tauri/src/main.rs)                        │
│  • OS keychain via Tauri secret store (48 supported keys)            │
│  • Spawns the Node.js sidecar at startup, supplies LOCAL_API_TOKEN   │
│  • Capability allowlist in src-tauri/capabilities/default.json       │
└──────────────────────────────────────────────────────────────────────┘
              │                                   │
              │ tauri::invoke (IPC)               │ env / process spawn
              ▼                                   ▼
┌─────────────────────────────────┐   ┌──────────────────────────────┐
│   Webview (WKWebView on macOS)  │   │   Node.js sidecar (port      │
│   ─────────────────────────────  │   │   46123, bound 127.0.0.1)    │
│   Vite bundle (dist/)            │   │   ──────────────────────────│
│   • src/main.ts entry            │   │   src-tauri/sidecar/         │
│   • src/components/  (panels)    │   │     local-api-server.mjs     │
│   • src/services/                │◄──┤   • 80+ static routes        │
│   • src/app/                     │   │   • 23 dynamic api/*.js      │
│   • src/config/   (variants)     │   │   • Bearer auth via          │
│   • src/types/index.ts           │   │     LOCAL_API_TOKEN          │
│   • Cesium 3D globe              │   │   • SSRF allowlist           │
│   • DeckGL / MapLibre 2D map     │   │   • Cache + retry, cloud     │
│   • TS strict, zero `any`        │   │     fallback                 │
└─────────────────────────────────┘   └──────────────────────────────┘
              │                                   │
              │ fetch http://127.0.0.1:46123/api/* with Bearer token
              ▼                                   ▼
                              External APIs (rate-limited, keyed)
                              GDACS · USGS · ACLED · GDELT · ThreatFox
                              FRED · Finnhub · Polymarket · NWS · NASA
                              CelesTrak · OpenSky · ECDC · OpenAQ ... etc
```

## Trust boundary

The renderer **never holds API keys directly**. The flow:

1. User enters keys via Settings → API Keys.
2. Tauri Rust persists them in the OS keychain (`KEYRING_SERVICE = "world-monitor"`).
3. On app launch, Rust reads keys from the keychain, generates a fresh per-process `LOCAL_API_TOKEN`, and spawns the sidecar with both as env vars.
4. The renderer queries Tauri for the bound sidecar port (resolved at runtime — never hardcoded), then makes authenticated `fetch` calls to `http://127.0.0.1:{port}/api/*` with the bearer token.
5. The sidecar enforces an SSRF allowlist on outbound requests (block private IPs, scheme allowlist, no `userinfo@` host) — see `local-api-server.mjs` `validateProxyUrl`.

The renderer only trusts the sidecar; the sidecar only trusts upstream APIs it explicitly allowlists. No external origin can speak to the sidecar — it's bound to `127.0.0.1` and requires the per-launch token.

## Repository layout

```
src/                        TypeScript frontend (Vite)
  app/                      App-level orchestration (panel layout, data loader, event handlers, country-intel, refresh scheduler)
  components/               Panel base class + every panel implementation + map / globe components
  config/                   Variant config: panels.ts, variants/*.ts, runtime-config.ts
  services/                 Mode manager, analytics, AI provider chain, cyber-extra, EMA forecast, settings
  styles/                   main.css + macos-native.css
  types/index.ts            Canonical types — including the 67-key MapLayers
  workers/ml.worker.ts      In-browser ML (CLIP, sentiment) via @xenova/transformers
  utils/sanitize.ts         escapeHtml + sanitizeUrl helpers (security policy)

src-tauri/
  src/main.rs               Rust entry — windows, keychain, sidecar spawn, IPC commands
  sidecar/
    local-api-server.mjs    Node.js HTTP server (port 46123, bearer-auth, SSRF allowlist)
    local-api-server.test.mjs   Sidecar route tests (77 cases)
  capabilities/default.json Tauri capability allowlist
  Info.plist                macOS bundle metadata
  Cargo.toml                Rust deps + features (devtools off by default)

api/                        File-based dynamic handlers loaded by the sidecar at startup
docs/                       Public docs (this directory)
docs/superpowers/specs/     Design specs, one per feature; status tracked there
docs/superpowers/plans/     Implementation plans paired with specs
e2e/                        Playwright end-to-end + visual regression tests
tests/                      Node-test unit tests (>540 cases — vault, panels, sidecar, sanitization)
scripts/                    release:prepare, install-built-app, validate-rss-feeds, secrets-scan, sync-main-to-mac
```

## Variant system

Four product variants share one application shell:

| Variant | Default panel count | Build target |
|---|---|---|
| `full` | 182 (181 enabled) | Web + desktop |
| `tech` | 35 | Web + desktop |
| `finance` | 31 | Web + desktop |
| `happy` | 10 | Web only |

Variant selection at build time happens via the `VITE_VARIANT` env var (read by `src/config/variant.ts`). The frontend code reads `SITE_VARIANT` from there and uses it to:

- Pick the right panel array (`FULL_PANELS`, `TECH_PANELS`, etc.) from `src/config/panels.ts`.
- Pick the right MapLayers default object (`FULL_MAP_LAYERS`, `TECH_MAP_LAYERS`, etc.).
- Filter the `PANEL_CATEGORY_MAP` to only the categories tagged with that variant.

There are no separate builds, no conditional compilation, no `if (variant === 'tech')` scattered through component code. Switching variants is a config swap.

## App mode state machine

`src/services/mode-manager.ts` governs five app modes:

| Mode | Trigger | Effect |
|---|---|---|
| `peace` | Default | Standard polling, full UI |
| `finance` | S&P500 ≥ 2.5%, BTC ≥ 5%, Oil ≥ 4%, or Gold ≥ 2% | Surface markets-first panel order |
| `war` | ≥ 2 war signals above confidence 0.6 (normalized by conflict baselines) | Surface intel-first panel order |
| `disaster` | GDACS Red OR 3+ Orange OR M ≥ 6.5 quake | Surface hazards-first panel order |
| `ghost` | Manual only — `⌘⇧G` or sidebar | × 5 polling, analytics suppressed, notifications muted, crimson/violet theme |

Mode transitions are deterministic and tested. The `mode` field is broadcast as a `wm:mode-changed` CustomEvent so panels and layout managers can react without polling state.

## Data flow

A typical fetch cycle for a panel:

1. `data-loader.ts` schedules a refresh via `refresh-scheduler.ts` (which applies a ghost-mode multiplier, hidden-tab × 10 multiplier, and jitter).
2. The panel calls a service function in `src/services/*` (e.g. `cyber-extra.ts` for ThreatFox).
3. The service function makes an authenticated `fetch` to the sidecar (`http://127.0.0.1:46123/api/threatfox-iocs?...` with `Authorization: Bearer ${LOCAL_API_TOKEN}`).
4. The sidecar validates the token, checks its in-memory cache, applies the SSRF allowlist if it's a proxy route, and forwards to the upstream API with the keychain-stored API key.
5. The response is normalized in the sidecar (canonical fields, error envelope, status codes), cached if appropriate, and returned to the renderer.
6. The panel renders. UI templates use `escapeHtml()` / `sanitizeUrl()` on every dynamic value. `target="_blank"` links always carry `rel="noopener noreferrer"`.

Errors:
- Sidecar errors return `{ error: '...', status: 502 }` (or 503 on rate limit).
- The renderer surfaces failures as banner notifications, never as silent stale state. Promise chains carry `.catch()` that logs and renders an empty/default panel state — see `src/app/country-intel.ts:150` for the canonical pattern.
- `Promise.allSettled` is used for fan-out fetches so one failed source can't drop the whole panel.

## God's Eye 3D globe

`src/components/GodsEyeView.ts` mounts a Cesium scene with:

- **Imagery:** Bing satellite (Cesium Ion token) → ArcGIS World Imagery fallback.
- **Buildings:** Google Photorealistic 3D Tiles → Cesium OSM Buildings → 2D extrusions → flat (5-tier fallback).
- **Satellite tracking:** SGP4 propagation in `src/workers/sgp4.worker.ts`. TLE data from CelesTrak. ISS, Starlink, weather satellites — no API key.
- **HUD:** `src/components/GlobeHUD.ts` is a separate overlay; state is pumped at ~10 fps via `hud.updateState({...})`.
- **Layer manager:** `GlobeDataManager.ts` owns 22 toggleable layers (military, conflict, cyclones, fires, vessels, satellites, ISS, etc.).
- **CSP requirement:** Cesium compiles GLSL shaders dynamically and requires `script-src 'unsafe-eval'`. PR #170 attempted to remove it and broke God's Eye entirely. Compensating controls are documented in `docs/SECURITY_FINDINGS.md`.

The 4D temporal extension (swimlane timeline, entity trails, playback modes) is designed in `docs/superpowers/specs/2026-04-13-gods-eye-4d-design.md` but not yet implemented.

## AI fallback chain

`src/services/ai/` resolves a summarization request through the chain:

1. **Ollama** (local) — preferred, runs on user's machine, no data leaves the device.
2. **Groq** — high-throughput cloud inference.
3. **Claude** — Anthropic API.
4. **OpenRouter** — unified gateway, multi-provider failover.
5. **Browser inference** — `@xenova/transformers` running CLIP / sentiment in a Web Worker, fully offline.

Each hop is an explicit boundary, not a catch-all `try/catch`. The chain works in air-gapped environments because of the final browser-inference fallback.

## Build pipeline

| Stage | Command | Output |
|---|---|---|
| Type-check | `npm run typecheck:all` | Validates both `tsconfig.json` (frontend) and `tsconfig.api.json` (sidecar). Must stay at zero errors. |
| Web build | `npm run build` | Vite bundles `dist/` (PWA-ready, includes precache). |
| Desktop build | `npm run desktop:build:full` | Tauri runs Rust + ships frontend → `src-tauri/target/release/bundle/macos/World Monitor.app`. |
| Release | `npm run release:prepare -- --bump patch --push` | Bumps version across `package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`, `Info.plist`; commits; tags `vX.Y.Z`; pushes. |

Desktop publishing is **tag-driven**: the GitHub `Build Desktop App` workflow only runs on `v*` tags. `workflow_dispatch` is build-only. `release:prepare` is the supported entry point.

## Testing

| Suite | Runner | Scope |
|---|---|---|
| `npm run typecheck:all` | tsc | Two-config strict type check; gating for any merge |
| `npm run test:sidecar` | node --test | Sidecar route + auth + SSRF + cache (77 cases) |
| `npm run test:data` | tsx --test | Frontend unit tests + config invariants (~540 cases) |
| `npm run test:feeds` | node | RSS feed health probe (informational, not a code gate) |
| `npm run test:e2e:full` | Playwright | End-to-end on full variant |
| `npm run test:e2e:tech` / `:finance` | Playwright | Per-variant e2e |
| `npm run test:e2e:visual` | Playwright | Golden-screenshot regressions per layer + zoom |

CI (`.github/workflows/`) gates on typecheck, ESLint, secret-scan, release-integrity, CodeQL, and the desktop-build smoke test. The sidecar/data tests are run locally and during release verification.

## Local install

After `npm run desktop:build:full`, install via:

```bash
node scripts/install-built-app.mjs --relaunch
```

This copies `src-tauri/target/release/bundle/macos/World Monitor.app` to `~/Applications/`. Direct `cp -R` is not supported when the destination exists.

A LaunchAgent at `~/.worldmonitor-main-sync/` watches `macos/main`, runs the full verification chain (`lockfile:check`, `npm ci`, `version:check`, `typecheck:all`, `build`, `desktop:build:app:full`), and reinstalls when `main` advances. Set up with `npm run main-sync:setup`. Inspect at `~/.worldmonitor-main-sync/status.json`.

## Key files for navigation

| Concern | File |
|---|---|
| Add a panel | `src/config/panels.ts` (registration) + `src/components/{Name}Panel.ts` (impl) |
| Add a sidecar route | `src-tauri/sidecar/local-api-server.mjs` (static) or `api/{name}.js` (dynamic) |
| Add a map layer | `src/types/index.ts` (canonical type) + variant defaults in `src/config/variants/*.ts` |
| Change app modes | `src/services/mode-manager.ts` |
| Change data refresh cadence | `src/app/refresh-scheduler.ts` |
| Add a secret key | `src-tauri/src/main.rs` (`SUPPORTED_SECRET_KEYS`) + `src/services/runtime-config.ts` |
| Update HUD | `src/components/GlobeHUD.ts` (rendering) + `src/components/GodsEyeView.ts` (state pump) |
| Security policy | `docs/SECURITY_FINDINGS.md`; sanitization helpers in `src/utils/sanitize.ts` |
