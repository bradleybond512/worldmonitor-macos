# Cloud API Access — Deployment Notes

## Overview

World Monitor macOS desktop uses a **local-first** architecture. All API requests go to the sidecar first
and fall back to the Vercel cloud only if the sidecar cannot respond.

Cloud fallback access is controlled by **origin + browser fetch metadata validation** in `api/_api-key.js`.
Desktop origins always require an API key. Trusted browser origins can use keyless access for read-only requests; non-read requests require `X-WorldMonitor-Key`.

## Architecture

```
Desktop App                          Cloud (Vercel)
┌──────────────────┐                ┌──────────────────────┐
│ fetch('/api/...')│                │ api/[domain]/v1/[rpc]│
│        │         │                │        │              │
│ ┌──────▼───────┐ │                │ ┌──────▼───────┐      │
│ │ sidecar try  │ │                │ │ validateApiKey│      │
│ │ (local-first)│ │                │ │ (origin-aware)│      │
│ └──────┬───────┘ │                │ └──────┬───────┘      │
│   fail │         │   fallback     │   pass/fail           │
│ ┌──────▼───────┐ │──────────────► │ ┌──────────────┐      │
│ │  cloud fetch │ │                │ │ route handler │      │
│ └──────────────┘ │                │ └──────────────┘      │
└──────────────────┘                └──────────────────────┘
```

## Origin-based Access Control

`api/_api-key.js` (`validateApiKey`) controls access:

- **Desktop origins** (`tauri.localhost`, `tauri://`, `asset://`) — **require an API key** (rejected without one)
- **Trusted browser origins** (`worldmonitor.app`, project Vercel previews, localhost dev) — allowed without a key only with explicit trusted `Origin` and browser `Sec-Fetch-*` metadata, and only for read-only methods
- **Unknown origins without a key** — rejected

The `WORLDMONITOR_VALID_KEYS` environment variable must be set in production with the valid key(s)
for desktop access. Desktop requests that omit or send an invalid key are rejected with a 401.

## Vercel Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CONVEX_URL` | Convex deployment URL | No (optional, for future use) |

## Files Reference

| File | Role |
|------|------|
| `src/services/runtime.ts` | Client-side sidecar-first fetch patch + cloud fallback |
| `api/_api-key.js` | Server-side origin-aware access control |
| `api/[domain]/v1/[rpc].ts` | Sebuf gateway — calls `validateApiKey` |
| `api/_cors.js` | CORS headers |
