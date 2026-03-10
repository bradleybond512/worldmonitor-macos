# Cloud API Access — Deployment Notes

## Overview

World Monitor desktop uses a **local-first** architecture. All API requests go to the sidecar first
and fall back to the Vercel cloud only if the sidecar cannot respond.

No application-level API key is required for cloud fallback. Access is controlled purely by
**origin-based validation** in `api/_api-key.js`.

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

- **Desktop origins** (`tauri.localhost`, `tauri://`, `asset://`) — allowed without a key
- **Web origins** (`worldmonitor.app`, Vercel previews, localhost) — allowed without a key
- **Unknown origins without a key** — rejected

The `WORLDMONITOR_VALID_KEYS` environment variable is not used in production. If set, it enables
optional per-key validation on top of origin checks.

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
