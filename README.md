# World Monitor

Tauri 2 + TypeScript + Rust desktop app for situational awareness — 182 live data panels across four product variants, a Cesium 3D globe with 22 geospatial layers, SGP4 satellite tracking in a Web Worker, AI summarization with a multi-provider fallback chain, and a Node.js sidecar that proxies external APIs over a bearer-authenticated localhost port.

[![Version](https://img.shields.io/github/v/release/bradleybond512/worldmonitor-macos?label=version)](https://github.com/bradleybond512/worldmonitor-macos/releases/latest)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)](tsconfig.json)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)](https://github.com/bradleybond512/worldmonitor-macos/releases/latest)

<a href="https://github.com/bradleybond512/worldmonitor-macos/releases/latest"><strong>Download Latest Release</strong></a>

## Variants

| Variant | Web | Desktop | Focus |
|---------|-----|---------|-------|
| `full` | Yes | Yes | Geopolitics, infrastructure, cyber, conflict, disasters |
| `tech` | Yes | Yes | AI, startups, cloud, service health, developer ecosystems |
| `finance` | Yes | Yes | Markets, commodities, macro signals, central banks |
| `happy` | Yes | No | Positive news, progress, science, conservation |

Variants share one application shell. Panel inventory, map-layer defaults, and feed configuration swap through `src/config/panels.ts` and `src/config/variant.ts` — no separate builds, no conditional compilation.

## Inventory

| Metric | Value | Source |
|--------|-------|--------|
| Product variants | 4 | `src/config/variant.ts` |
| Default panels (full) | 182 total · 181 enabled | `src/config/panels.ts` |
| Default panels (tech / finance / happy) | 35 / 31 / 10 | `src/config/panels.ts` |
| God's Eye 3D globe layers | 22 | `src/components/GodsEyeView.ts` |
| Supported secret keys | 48 | `src-tauri/src/main.rs` |
| Locales | 19 | `src/locales/` |
| Sidecar route handlers | 80+ static · 23 file-based | `src-tauri/sidecar/local-api-server.mjs` + `api/*.js` |

## God's Eye

Full-viewport Cesium 3D globe view. Activate with `G` or the sidebar.

- **22 live data layers** — military bases, nuclear facilities, earthquakes, conflicts, airstrikes, cyclones, fires, vessels, flights, cyber threats, submarines, cables, ports, satellites, ISS, and more.
- **HUD overlay** — threat assessment card, mode badge, HOTSPOTS / ALT / CONFLICT / DISASTER stat pills, nearest hotspot (haversine), sun-phase badge (DAY/GOLDEN/CIVIL/NAUTICAL/ASTRO/NIGHT), local clock at camera longitude, scrolling LIVE alert ticker, top-5 alert list, layer-toggle bar.
- **Fly Mode** — first-person flight over the globe with WASD/mouse; right-click drag for look, scroll for speed.
- **Time Machine** — scrub historical data across a configurable time window.
- **Satellite tracking** — SGP4 orbital propagation in a Web Worker for ISS, Starlink, weather satellites; TLEs from CelesTrak, no API key required.
- **3D buildings** — five-tier fallback: Google Photorealistic → Cesium OSM Buildings → 2D extrusions → flat. Photorealistic requires `GOOGLE_MAPS_API_KEY`.
- **Imagery** — Bing satellite (Cesium Ion token) → ArcGIS World Imagery fallback.

A 4D temporal extension (swimlane timeline, entity trails, playback modes) is designed in [`docs/superpowers/specs/2026-04-13-gods-eye-4d-design.md`](docs/superpowers/specs/2026-04-13-gods-eye-4d-design.md) but not yet implemented.

## Intelligence coverage

| Domain | Sample panels |
|--------|---------------|
| **Conflict & geopolitics** | Live conflict zones, ACLED events, ISW reports, ORBAT, kill chain, theater polygons, STIX/TAXII feeds, military bases, nuclear facilities |
| **Cyber & threats** | ThreatFox IOCs, OpenPhish, Spamhaus, CISA KEV, ICS/OT dashboard, network topology, CVE tracker, dark web, urlscan, IOC manager, 24-session EMA threat forecast |
| **Markets & finance** | S&P 500, BTC, oil, gold, commodities, macro signals, sector heatmap (Finnhub), central bank calendar, FDIC failures, EDGAR filings |
| **Disasters & weather** | GDACS Red/Orange events, M6.5+ earthquakes, NASA FIRMS wildfire perimeters, tropical cyclones, NWS alerts, SPC mesoscale, FAA weather cams, RainViewer radar, tide predictions, pollen |
| **Disease & humanitarian** | ECDC surveillance, OpenAQ air quality, ReliefWeb crises, ACAPS, food insecurity, water quality, WHO outbreaks |
| **Space** | ISS + Starlink + weather satellite tracking, SGP4 propagation, spaceflight news, space launches, aerospace re-entry |
| **Infrastructure** | Submarine cables, maritime vessels, dark-vessel detection, flight tracking, ADS-B military, port status, datacenter outages, internet exchange points, internet disruptions |
| **AI & tech (tech variant)** | AI news, tech-readiness, hardware, cloud, dev tools, service status, GitHub trends, Product Hunt |

A complete category-by-category panel inventory lives in [docs/FEATURES.md](docs/FEATURES.md).

## App modes

Five modes (`peace`, `finance`, `war`, `disaster`, `ghost`) trigger on live signal thresholds — S&P ≥ 2.5%, ≥ 2 war signals above confidence 0.6 normalized by conflict baselines, GDACS Red events, etc. Mode transitions are deterministic and testable. Ghost Mode (`⌘⇧G`) suppresses analytics, multiplies poll intervals × 5, and switches the UI to a crimson/violet theme.

See [src/services/mode-manager.ts](src/services/mode-manager.ts) for thresholds.

## Stack

| Layer | Stack |
|-------|-------|
| Frontend | TypeScript (strict), Vite, MapLibre GL, deck.gl, Cesium, D3, i18next |
| Contracts | Buf, Protobuf, generated TypeScript clients + OpenAPI |
| Desktop shell | Tauri v2, Rust, OS keychain, Node.js sidecar (port 46123) |
| AI fallback | Ollama (local) → Groq → Claude → OpenRouter → in-browser inference |
| Verification | TypeScript strict, Playwright e2e + visual, sidecar unit tests |
| CI/CD | Tag-driven desktop publish, release-manifest verification, CodeQL |

The full architecture is documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Security boundary

The renderer never holds API keys directly. They live in the OS keychain via Tauri's secret store, are loaded into the sidecar at startup, and the renderer talks to the sidecar over a bearer-authenticated `127.0.0.1:46123` port resolved at runtime. The sidecar enforces an SSRF allowlist (block private IPs, scheme allowlist, no `userinfo@` host) on all proxy routes.

`script-src 'unsafe-eval'` is required by Cesium's GLSL shader compilation. Removing it has been attempted (PR #170) and silently broke God's Eye. The compensating controls are documented in [docs/SECURITY_FINDINGS.md](docs/SECURITY_FINDINGS.md).

## Quick start

```bash
# Web (default variant)
npm ci && npm run dev

# Other web variants
npm run dev:tech
npm run dev:finance

# Desktop (Tauri)
npm run desktop:dev                 # dev build
npm run desktop:build:full          # production build → src-tauri/target/release/bundle/
npm run typecheck:all               # both tsconfig.json + tsconfig.api.json must stay at 0 errors

# Releases (tag-driven)
npm run release:prepare -- --bump patch --push
```

Install the desktop build by copying `src-tauri/target/release/bundle/macos/World Monitor.app` to `~/Applications/`. The supported install path is `node scripts/install-built-app.mjs --relaunch`.

API keys go through Settings → API Keys (gear icon). Setup details live in [docs/API_KEYS.md](docs/API_KEYS.md) and [docs/DESKTOP_CONFIGURATION.md](docs/DESKTOP_CONFIGURATION.md).

## Tauri 2 / WKWebView gotchas

- **Window drag**: CSS `-webkit-app-region: drag` is silently ignored. Use JS `mousedown` → `tryInvokeTauri('plugin:window|start_dragging')`. Requires `core:window:allow-start-dragging` in `src-tauri/capabilities/default.json`.
- **Local iframes**: always `http://127.0.0.1:{port}`, never `localhost` — CSP only allows `127.0.0.1`, and WKWebView treats them as distinct origins.
- **Devtools**: only built when `--features devtools` is passed (`cargo tauri dev --features devtools`); not part of the default feature set, so production builds have no devtools.

## Documentation

| Guide | Purpose |
|-------|---------|
| [docs/FEATURES.md](docs/FEATURES.md) | Complete panel inventory by category |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Frontend / sidecar / Rust shell / data flow / build pipeline |
| [docs/SECURITY_FINDINGS.md](docs/SECURITY_FINDINGS.md) | What was fixed, what's accepted, the standing security policy |
| [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) | Entry point for the rest of the docs tree |
| [docs/API_KEYS.md](docs/API_KEYS.md) | All 48 API keys — categories, signup URLs, free vs paid |
| [docs/DESKTOP_CONFIGURATION.md](docs/DESKTOP_CONFIGURATION.md) | Desktop secret keys, feature availability, fallback |
| [docs/API_KEY_DEPLOYMENT.md](docs/API_KEY_DEPLOYMENT.md) | Cloud API trust boundary and origin rules |
| [docs/ADDING_ENDPOINTS.md](docs/ADDING_ENDPOINTS.md) | Proto + Buf workflow for new RPC endpoints |
| [docs/RELEASE_PACKAGING.md](docs/RELEASE_PACKAGING.md) | Desktop packaging and signing workflow |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributor workflow, checks, PR expectations |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting and scope |

## Contributing

If a change touches product behavior, API contracts, or operational workflows, update the docs in the same branch. Branch convention is `claude/*` for Claude sessions and `codex/*` for Codex sessions; PRs to `macos/main` use GitHub auto-merge gated on required CI checks.

## License and attribution

Licensed under AGPL-3.0-only. This desktop project builds on top of [koala73/worldmonitor](https://github.com/koala73/worldmonitor) by Elie Habib.
