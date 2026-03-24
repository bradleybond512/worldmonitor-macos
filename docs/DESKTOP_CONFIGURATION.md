# Desktop Runtime Configuration

World Monitor desktop uses a runtime configuration schema with per-feature toggles and secret-backed credentials. This document describes the current desktop implementation, not the broader shared web/runtime type surface.

## Secret keys

The desktop vault schema (Rust `SUPPORTED_SECRET_KEYS`) supports the following 26 keys:

- `WORLDMONITOR_API_KEY`
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`
- `FRED_API_KEY`
- `EIA_API_KEY`
- `CLOUDFLARE_API_TOKEN`
- `ACLED_ACCESS_TOKEN`
- `ACLED_EMAIL`
- `URLHAUS_AUTH_KEY`
- `OTX_API_KEY`
- `ABUSEIPDB_API_KEY`
- `WINGBITS_API_KEY`
- `WS_RELAY_URL`
- `VITE_OPENSKY_RELAY_URL`
- `OPENSKY_CLIENT_ID`
- `OPENSKY_CLIENT_SECRET`
- `AISSTREAM_API_KEY`
- `VITE_WS_RELAY_URL`
- `FINNHUB_API_KEY`
- `NASA_FIRMS_API_KEY`
- `OLLAMA_API_URL`
- `OLLAMA_MODEL`
- `WTO_API_KEY`
- `AVIATIONSTACK_API`
- `ICAO_API_KEY`
- `THREATFOX_API_KEY`

Notes:

- `UC_DP_KEY` also exists in the TypeScript union but is not currently part of the Rust desktop vault schema or sidecar environment sync.

## Feature schema

Each feature includes:

- `id`: stable feature identifier.
- `requiredSecrets`: list of keys that must be present and valid.
- `enabled`: user-toggle state from runtime settings panel.
- `available`: computed (`enabled && requiredSecrets valid`).
- `fallback`: user-facing degraded behavior description.

## Desktop secret storage

Desktop builds persist secrets in the OS credential store through Tauri command bindings backed by Rust `keyring` entries (`world-monitor` service namespace).

Secrets are **not stored in plaintext files** by the frontend.

## Degradation behavior

If required secrets are missing or disabled:

- Summarization: provider-specific hosted paths (Groq/OpenRouter) are skipped and the app continues down the configured fallback chain, ending at the browser model if needed.
- FRED / EIA / Finnhub: economic, oil analytics, and stock data return empty state.
- Cloudflare / ACLED: outages/conflicts return empty state.
- Cyber threat feeds (URLhaus, OTX, AbuseIPDB): cyber threat layer returns empty state.
- NASA FIRMS: satellite fire detection returns empty state.
- Wingbits: flight enrichment disabled, heuristic-only flight classification remains.
- AIS / OpenSky relay: live tracking features are disabled cleanly.

## Current schema gaps

The desktop settings UI and shared runtime types have evolved faster than the Rust vault schema in a few places. At the moment:

- `UC_DP_KEY` is present in TypeScript types and labels, but it is not currently wired into the Rust desktop secret store or sidecar sync path.

Documentation and release notes for the packaged macOS build should treat `UC_DP_KEY` as unsupported until the Rust schema is updated.
