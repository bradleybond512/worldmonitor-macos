# OSINT Expansion Design

**Date:** 2026-03-25
**Status:** Approved
**Scope:** Three new panels, six new sidecar routes, two new map layers, four new API keys

---

## Overview

Extend World Monitor's intelligence surface with three new panels covering cyber threat intelligence aggregation, geospatial conflict/military intelligence, and dark web/breach awareness. All new data is purely informational/awareness-focused (no personal-action features).

---

## Components

### 1. ThreatIntelHubPanel

**File:** `src/components/ThreatIntelHubPanel.ts`
**Panel ID:** `threat-intel-hub`
**Default:** enabled, priority 2, `intelligence` category

Aggregates four open-source cyber threat intelligence feeds into a single panel:

- **GreyNoise Community** — trending malicious IPs currently scanning the internet (no key)
- **AlienVault OTX** — threat pulses with IoC lists: IPs, domains, hashes (`OTX_API_KEY`)
- **AbuseIPDB** — recently reported IPs with abuse confidence scores (`ABUSEIPDB_API_KEY`)
- **URLscan.io** — recent malicious scan results, phishing/malware URLs (no key)

Sections degrade gracefully: key-gated sections show `showConfigError()` if key absent, free sections always render. Display: severity-badged feed rows, IoC type tags (IP / domain / URL / hash), source attribution.

### 2. GeoIntelPanel

**File:** `src/components/GeoIntelPanel.ts`
**Panel ID:** `geo-intel`
**Default:** enabled, priority 2, `intelligence` category

Two sources feeding both the panel table and new map layers:

- **ACLED API v3** — full conflict event stream: battles, explosions, violence against civilians, protests, riots. Fields: actor names, fatality count, event date, coordinates, source URL. (`ACLED_API_KEY` + `ACLED_EMAIL`)
- **OpenSky Network** — live aircraft with military squawk codes (7700/7600/7500) or known military ICAO hex prefixes. Fields: callsign, altitude, speed, coordinates. (no key)

Panel shows: event list sorted by recency/severity, pattern summary (top active zones, escalation trend indicator). Map layer data is shared from the same fetch — no duplicate requests.

### 3. DarkWebPanel

**File:** `src/components/DarkWebPanel.ts`
**Panel ID:** `dark-web`
**Default:** enabled, priority 2, `intelligence` category

Informational/awareness only — no personal-action features:

- **HIBP public breach list** — recent data breaches: name, date, exposed record count, data classes compromised (no key)
- **Tor Metrics relay doc** — total relay count, exit node count, top exit countries (no key)

Display: breach timeline table (most recent first), Tor exit density by country, aggregate exposure stats (total records exposed in last 30 days).

---

## Sidecar Routes

All routes added to `src-tauri/sidecar/local-api-server.mjs`. All use the existing `ttlCache()` helper.

| Route | Source | Key Required | TTL |
|---|---|---|---|
| `/api/greynoise-trending` | GreyNoise Community API | none | 15 min |
| `/api/otx-pulses` | AlienVault OTX v2 | `OTX_API_KEY` | 30 min |
| `/api/abuseipdb-reports` | AbuseIPDB blacklist endpoint | `ABUSEIPDB_API_KEY` | 30 min |
| `/api/urlscan-feed` | URLscan.io recent results | none | 15 min |
| `/api/acled-events` | ACLED API v3 | `ACLED_API_KEY` + `ACLED_EMAIL` | 10 min |
| `/api/adsb-military` | OpenSky Network states | none | 2 min |
| `/api/hibp-breaches` | HIBP public breach list | none | 60 min |
| `/api/tor-metrics` | Tor Metrics relay doc | none | 60 min |

All routes sit behind the existing `LOCAL_API_TOKEN` auth gate. External API calls use `fetchWithTimeout()` with `CHROME_UA`.

---

## Map Layers

Two new layers added to `FULL_MAP_LAYERS` in `src/config/panels.ts`:

### `acledEvents`
- Source: `/api/acled-events` (shared with GeoIntelPanel, no duplicate fetch)
- Dot color by event type: battles (red `#ef4444`), explosions/remote violence (orange `#f97316`), violence against civilians (dark red `#991b1b`), protests (yellow `#eab308`), riots (amber `#d97706`)
- Click-to-fly → popup with actor names, fatality count, date, ACLED source URL
- Independent toggle from existing GDELT/UCDP conflict layers

### `militaryFlights`
- Source: `/api/adsb-military` (shared with GeoIntelPanel)
- Dot color by squawk: 7700 emergency (red), 7600 comms loss (orange), 7500 hijack (crimson), standard military (blue `#3b82f6`)
- Popup: callsign, altitude, speed, squawk code
- Refresh: 2 min (driven by GeoIntelPanel's fast refresh cycle)

No map layer for Tor or breach data — country-level stats rendered as panel tables only, consistent with Spamhaus DROP handling.

---

## Frontend Services

New module: `src/services/osint/`

```
src/services/osint/
  index.ts          # re-exports from sub-files
  threat-intel.ts   # fetchGreyNoise, fetchOtxPulses, fetchAbuseIpDb, fetchUrlscanFeed
  geo-intel.ts      # fetchAcledEvents, fetchAdsbMilitary
  dark-web.ts       # fetchHibpBreaches, fetchTorMetrics
```

Mirrors `src/services/cyber/` structure. Each function fetches from its sidecar route via the patched `fetch()`. No new auth logic — token injection is automatic.

Refresh cadences in `data-loader.ts`:
- `adsb-military`: every 2 min (alongside other fast-refresh sources)
- `acled-events`: every 10 min
- `greynoise-trending`, `urlscan-feed`: every 15 min
- `otx-pulses`, `abuseipdb-reports`: every 30 min
- `hibp-breaches`, `tor-metrics`: every 60 min

---

## Settings & API Keys

Four new keys added to `SUPPORTED_SECRET_KEYS` in `main.rs` (25 → 29):

| Key | Panel | Source | Free Tier |
|---|---|---|---|
| `OTX_API_KEY` | ThreatIntelHub | alienvault.com/account | Yes, unlimited |
| `ABUSEIPDB_API_KEY` | ThreatIntelHub | abuseipdb.com/api | Yes, 1k checks/day |
| `ACLED_API_KEY` | GeoIntel | acleddata.com/register | Yes, registration required |
| `ACLED_EMAIL` | GeoIntel | acleddata.com/register | Yes (paired with API key) |

Changes required across:
- `src-tauri/src/main.rs` — add 4 keys to `SUPPORTED_SECRET_KEYS`
- `src/services/runtime-config.ts` — add key definitions with `isDesktopOnly: true`
- `src/services/settings-constants.ts` — `HUMAN_LABELS` + `SIGNUP_URLS` entries

Panels without required keys (GreyNoise, URLscan, HIBP, Tor Metrics sections) render immediately. Key-gated sections call `showConfigError()` — same UX as Finnhub/Sector Heatmap today.

---

## Files to Create

| File | Purpose |
|---|---|
| `src/components/ThreatIntelHubPanel.ts` | Panel component |
| `src/components/GeoIntelPanel.ts` | Panel component |
| `src/components/DarkWebPanel.ts` | Panel component |
| `src/services/osint/index.ts` | Service re-exports |
| `src/services/osint/threat-intel.ts` | Cyber intel fetch functions |
| `src/services/osint/geo-intel.ts` | Geo/military fetch functions |
| `src/services/osint/dark-web.ts` | Dark web fetch functions |

## Files to Modify

| File | Change |
|---|---|
| `src-tauri/sidecar/local-api-server.mjs` | 8 new routes |
| `src-tauri/src/main.rs` | 4 new secret keys |
| `src/config/panels.ts` | 3 new panel registrations, 2 new map layers |
| `src/services/runtime-config.ts` | 4 new key definitions |
| `src/services/settings-constants.ts` | Labels + signup URLs |
| `src/components/index.ts` | Export 3 new panel classes |
| `src/app/panel-layout.ts` | Instantiate 3 new panels |
| `src/app/data-loader.ts` | Wire refresh cycles |
| `src/app/app-context.ts` | Add panel refs |

---

## Error Handling

- All sidecar routes return `{ error: string }` on failure (existing convention) — frontend ignores and shows stale or empty state
- Circuit breakers not needed for sidecar-proxied routes (sidecar handles timeouts via `fetchWithTimeout`)
- Key-absent state: `isFeatureAvailable()` guard in each fetch function, returns `[]` if missing — panel shows `showConfigError()`
- TTL cache in sidecar prevents hammering external APIs on panel re-renders

---

## Out of Scope

- IntelX integration (requires paid API for meaningful data)
- Personal breach checking (enter-your-email feature) — informational only
- ADSB-Exchange commercial API (OpenSky free tier sufficient for military squawk filtering)
- Dark web forum scraping
