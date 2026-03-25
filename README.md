# World Monitor

[![Release](https://img.shields.io/github/v/release/bradleybond512/worldmonitor-macos?label=version)](https://github.com/bradleybond512/worldmonitor-macos/releases/latest)
[![Desktop CI](https://github.com/bradleybond512/worldmonitor-macos/actions/workflows/build-desktop.yml/badge.svg)](https://github.com/bradleybond512/worldmonitor-macos/actions/workflows/build-desktop.yml)
[![License](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](./LICENSE)

World Monitor is a local-first situational awareness application for geopolitical, infrastructure, climate, cyber, and market intelligence.

It ships as:

- A web app (Vite + TypeScript)
- A desktop app (Tauri 2 with local sidecar + secure local storage)
- A progressive web app (installable, offline-aware)

<p>
  <a href="https://github.com/bradleybond512/worldmonitor-macos/releases/latest"><strong>Download Latest Release</strong></a>
</p>

## What Is Actually In This Repo

This README intentionally lists only implemented capabilities that are wired in code today.

Core references:

- Panel configuration: [src/config/panels.ts](./src/config/panels.ts)
- Panel wiring: [src/app/panel-layout.ts](./src/app/panel-layout.ts)
- Data refresh orchestration: [src/app/data-loader.ts](./src/app/data-loader.ts)
- Sidecar API server: [src-tauri/sidecar/local-api-server.mjs](./src-tauri/sidecar/local-api-server.mjs)

Implemented capability groups include:

- Strategic and intelligence views: strategic posture, strategic risk, geo hubs, GDELT intel, alert center, Telegram intel
- Infrastructure and resilience signals: communications health, internet disruptions, cable activity/health, service status
- Crisis and hazard monitoring: GDACS, NWS alerts, tsunami alerts, tropical cyclones, wildfire and climate-related layers
- Security and cyber: cyber threat feeds, security advisories, signal fusion support
- Population and humanitarian context: displacement, disease outbreaks, food insecurity, air quality, population exposure
- Markets and macro: macro signals, ETF flows, stablecoin monitoring, trade policy, supply chain, fear/greed, fuel prices
- Variant-specific focus packs for `full`, `tech`, `finance`, and `happy`

## Variants

- `full`: broad geopolitical + infrastructure + disaster + macro coverage
- `tech`: AI, startups, platform risk, regulation, and market overlays
- `finance`: macro/market-first view with policy and risk context
- `happy`: positive-news-focused reduced-noise mode

Runtime variant selection is handled through:

- [src/config/variant.ts](./src/config/variant.ts)
- [src/config/variants/](./src/config/variants/)

## Architecture

Frontend:

- TypeScript + Vite
- Panel-based UI with explicit data refresh scheduling
- Map + layer system for geospatial overlays

Backend/API:

- Edge APIs in [api/](./api)
- Generated RPC handlers in [api/[domain]/v1/[rpc].ts](./api/[domain]/v1/[rpc].ts)
- Shared server handlers in [server/](./server)

Desktop:

- Tauri shell in [src-tauri/](./src-tauri)
- Local API sidecar for desktop-specific secure/local flows
- Local secret update + validation endpoints with allowlists

Data quality and reliability:

- Cache tiering, stale fallback behavior, and request deduping
- Regression tests for panel wiring, route parity, feed freshness, and auth behavior

## Quick Start

### Prerequisites

- Node.js 20+ (22 recommended)
- npm
- Rust toolchain (desktop builds)
- Xcode command line tools on macOS (desktop builds)

### Install

```bash
npm ci
```

### Run Web App

```bash
npm run dev          # full
npm run dev:tech     # tech
npm run dev:finance  # finance
npm run dev:happy    # happy
```

### Build Web App

```bash
npm run build:full
npm run build:tech
npm run build:finance
npm run build:happy
```

## Desktop Commands

Development:

```bash
npm run desktop:dev
```

Package/build commands currently available:

```bash
# macOS
npm run desktop:build:full
npm run desktop:build:tech
npm run desktop:build:finance

# macOS app-only (no dmg/msi)
npm run desktop:build:app:full
npm run desktop:build:app:tech
npm run desktop:build:app:finance

# explicit package targets
npm run desktop:package:macos:full
npm run desktop:package:macos:tech
npm run desktop:package:macos:finance
npm run desktop:package:windows:full
npm run desktop:package:windows:tech
```

Signed package commands:

```bash
npm run desktop:package:macos:full:sign
npm run desktop:package:macos:tech:sign
npm run desktop:package:macos:finance:sign
npm run desktop:package:windows:full:sign
npm run desktop:package:windows:tech:sign
```

## Quality Gates

Main local checks:

```bash
npm run typecheck:all
npm run test:data
npm run test:sidecar
npm run test:feeds
npm run lint:md
npm run lockfile:check
npm run version:check
npm audit
```

Note:

- Playwright runtime tests may require a non-sandboxed environment on some systems.
- Desktop packaging requires platform-specific build/signing prerequisites.

## Security Model (High Level)

- Desktop sidecar enforces local auth/token behavior and key allowlists
- CORS + API key guardrails for desktop/cloud boundary
- Rate-limiting + cache-based pressure controls
- Secret scanning in local/CI workflows
- Dedicated [SECURITY.md](./SECURITY.md) policy and disclosure path

## Documentation Map

- Product and architecture docs: [docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md)
- Desktop config and key management: [docs/DESKTOP_CONFIGURATION.md](./docs/DESKTOP_CONFIGURATION.md)
- API key deployment model: [docs/API_KEY_DEPLOYMENT.md](./docs/API_KEY_DEPLOYMENT.md)
- Release packaging/signing: [docs/RELEASE_PACKAGING.md](./docs/RELEASE_PACKAGING.md)
- Contribution standards: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)

## Contributing

Contributions are welcome. Start with:

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [SECURITY.md](./SECURITY.md)

## License

AGPL-3.0-only. See [LICENSE](./LICENSE).
