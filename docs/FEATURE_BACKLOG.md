# WorldMonitor — Feature Backlog

Planned features and improvements for future development. Items are sourced from the internal
roadmap (`docs/Docs_To_Review/todo.md`) and the `[Unreleased]` section of `CHANGELOG.md`.

Priority: 🔴 High · 🟡 Medium · 🟢 Low

---

## In-Progress / Unreleased (CHANGELOG [Unreleased])

These features have been partially or fully implemented but not yet released:

### Arrival Choreography
Canvas overlay for animated world events:
- Wavefront ripple: ease-out expanding ring (0→280px, 2.6s, dual trailing rings) via `triggerArrivalEffect()` on DeckGLMap
- Corona pulse: looping radial glow on high-severity hotspots, synced to `setHotspotLevels()`
- Global flare: full-screen flash on War/Disaster/Finance mode transitions and war-score threshold crossings
- Threat-type color coding: conflict=red, cyber=cyan, economic=gold, natural=orange, generic=purple
- Respects `prefers-reduced-motion`; hard caps (20 wavefronts, 5 flares)

### Shareable URL State
- `?view=&zoom=&lat=&lon=&layers=&timeRange=` serialized on every map interaction
- LZ-string compression when query string exceeds 2,000 bytes
- Decompression bomb guard: max 32 KB decompressed, max 8 KB input
- `Cmd+S` copies share URL to clipboard with bottom-center toast

### Ollama Streaming
- Real-time typewriter effect for AI panel summaries
- `/api/ollama-stream` SSE endpoint in sidecar
- Falls through to Groq → Claude → OpenRouter → Browser T5 if Ollama is not configured

---

## 🔴 High Priority

### TODO-001 — Decompose App.ts into a Controller Architecture
**Effort:** ~2 days | **Depends on:** BUG-001

Break the 4,357-line God-class into focused controllers:
- `DataLoader` — orchestrates all `fetch*` calls and refresh timers
- `PanelManager` — creates, orders, drags, and persists panel layout
- `MapController` — wraps `MapContainer`, handles layer toggles and country clicks
- `DeepLinkRouter` — handles URL state, story links, country brief links
- `RefreshScheduler` — manages `setInterval`/`setTimeout` lifecycle

Create `src/controllers/` directory. Keep `App` as a thin composition root.

---

### TODO-002 — Server-Side RSS Aggregation and Caching
**Effort:** ~3 days

Move RSS fetching to a server-side edge function (or Vercel cron) that:
1. Fetches all feeds on a 3-minute cron
2. Stores merged results in Redis (Upstash already in `package.json`)
3. Exposes a single `/api/news` endpoint returning the cached aggregate

Replace ~40 proxy rules in `vite.config.ts` with a single fetch to `/api/news`.

---

### TODO-003 — Real-Time Alert Webhooks (Slack / Discord / Email)
**Effort:** ~2 days

Critical signals (military surge, CII spikes, geo-convergence) sent to external channels when the tab is not active:
1. Settings UI for webhook config (URL + secret + filter by priority)
2. Store webhook config in localStorage (web) or OS keyring (desktop)
3. POST signal payload to webhook URL at user-configured threshold
4. Support Slack incoming webhook format and Discord webhook format

---

### TODO-004 — Comprehensive API Handler Test Suite
**Effort:** ~2 days | **Depends on:** BUG-014

52 of 55 API handlers have zero test coverage. Add unit tests using Node built-in test runner (`node --test`):
- Valid input → correct response
- Malformed input → 400 error
- Upstream failure → graceful error response

---

### TODO-005 — Cross-Platform npm Script Compatibility
**Effort:** ~1 hour | **Depends on:** BUG-013, BUG-019

All `VITE_VARIANT=…` scripts break on Windows. Install `cross-env` as devDependency and prefix every inline env-var assignment.

---

### TODO-039 — Command Palette (Ctrl+K / ⌘K)
**Effort:** ~1 day

Discord/VSCode-style command palette: "Go to country", "Toggle layer", "Open panel", "Export data", "Change language".

---

### TODO-064 — Responsive Mobile Layout (Below 768px)
**Effort:** ~3 days

Currently shows a MobileWarningModal. Implement a responsive bottom-sheet layout with swipeable panels and a condensed header.

---

## 🟡 Medium Priority

### TODO-006 — Temporal Anomaly Detection ("Unusual for This Time")
**Effort:** ~3 days

Flag when activity deviates from time-of-day/week norms. Example: "Military flights 3× normal for a Tuesday".
- Extend `src/services/temporal-baseline.ts` to store per-hour-of-week baselines in IndexedDB
- Generate `temporal_anomaly` signals when z-score > 2.0

---

### TODO-007 — Trade Route Risk Scoring
**Effort:** ~4 days

Score major shipping routes based on chokepoint risk, AIS disruptions, and military posture. Define routes in `src/config/trade-routes.ts`, display as a new panel with optional map overlay.

---

### TODO-008 — Choropleth CII Map Layer
**Effort:** ~2 days

Overlay the map with country-colored fills based on CII score. Use deck.gl `GeoJsonLayer` with red-yellow-green scale. Toggleable layer with legend.

---

### TODO-009 — Custom Country Watchlists (Tier 2 Monitoring)
**Effort:** ~2 days

Allow users to add custom countries to a Tier 2 watchlist with the same CII scoring pipeline. "+" button in CII panel, stored in localStorage, collapsible sub-section.

---

### TODO-010 — Historical Playback with Timeline Scrubbing
**Effort:** ~3 days

Visual timeline scrubber to replay dashboard state. Build `src/components/Timeline.ts` with dots for stored snapshots (7 days), scrubbing auto-play, and "Live" button.

---

### TODO-011 — Election Calendar Integration (Auto-Boost Sensitivity)
**Effort:** ~1 day

Create `src/config/elections.ts`. Apply 1.3× multiplier to Information component in `calculateCII()` for countries with elections within 30 days. Show "🗳 Election Watch" badge.

---

### TODO-012 — News Translation Support (Localized Feeds)
**Effort:** ~3 days

Restructure `src/config/feeds.ts` for per-language URLs. "Translate" button per news card calling `summarization.ts`. Cache translations in a Map.

---

### TODO-013 — Map Popup Modularization
**Effort:** ~2 days | **Depends on:** BUG-016, BUG-020

`MapPopup.ts` (113 KB) and `DeckGLMap.ts` (156 KB) are the largest files. Create `src/components/popups/` with per-layer modules and a `PopupFactory.ts` dispatcher.

---

### TODO-014 — ESLint + Prettier Setup
**Effort:** ~1 day

Install ESLint with `@typescript-eslint`, Prettier plugin, `lint-staged` + `husky` pre-commit hook. Add `lint` and `format` npm scripts.

---

### TODO-015 — Desktop Notification Support for Critical Signals
**Effort:** ~1 day

Use Web Notifications API (+ Tauri native notifications) to push critical signals when the tab is in background. Clicking notification focuses tab and opens Signal Modal.

---

### TODO-016 — Stablecoin De-peg Monitoring Enhancements
**Effort:** ~1 day

When stablecoin deviates > 0.5% from peg, correlate with CII country score > 70. Generate `stablecoin_depeg` signal.

---

### Panel UX (Medium)

| TODO | Feature | Effort |
|------|---------|--------|
| TODO-026 | Panel drag-and-drop reordering, persist in localStorage | ~1 day |
| TODO-027 | Panel vertical resize handles, persist sizes | ~1 day |
| TODO-028 | Collapsible panel groups (Security, Markets, Intel) | ~4 hours |
| TODO-029 | Panel search / quick filter input | ~4 hours |
| TODO-030 | Multi-column panel layout for ultra-wide monitors (>2560px) | ~1 day |
| TODO-032 | Panel maximize / full-width view (double-click header) | ~4 hours |
| TODO-035 | Panel data age indicator (green/yellow/red dot for staleness) | ~4 hours |
| TODO-038 | Breadcrumb navigation for Country Drill-Down | ~4 hours |
| TODO-041 | Toast notification system (stacking, bottom-right, auto-dismiss) | ~4 hours |
| TODO-042 | Skeleton loading placeholders (shimmer effect) | ~1 day |
| TODO-043 | Empty state illustrations per panel | ~1 day |
| TODO-044 | News card redesign with og:image thumbnails | ~1 day |
| TODO-045 | News article preview modal with AI summary | ~1 day |
| TODO-046 | News sentiment badge per article (🔴/🟡/🟢) | ~4 hours |
| TODO-048 | News read/unread state in localStorage | ~4 hours |
| TODO-050 | Map style selector UI with preview thumbnails | ~4 hours |
| TODO-054 | Map heatmap toggle for event density | ~1 day |
| TODO-055 | Map layer legend panel (collapsible, bottom-left) | ~4 hours |
| TODO-056 | Map geofence alert zones (draw polygon, get notified) | ~2 days |
| TODO-059 | Country quick info tooltip on map hover | ~4 hours |
| TODO-061 | Standardized severity color coding across all panels | ~4 hours |
| TODO-062 | Sparkline mini-charts in panel headers (24h trend) | ~1 day |
| TODO-063 | Panel data trend arrows (↑/↓ since last refresh) | ~2 hours |
| TODO-065 | Tablet layout 768–1024px (split-view, touch-optimized) | ~2 days |
| TODO-066 | Map controls touch optimization | ~4 hours |
| TODO-067 | Swipe gesture navigation between panels (mobile) | ~1 day |
| TODO-068 | Full-screen immersive map mode (hide header + sidebar) | ~4 hours |
| TODO-069 | Map auto-focus on critical events | ~4 hours |
| TODO-070 | Notification center / activity feed (bell icon, chronological) | ~1 day |
| TODO-071 | User onboarding tour (first-time tooltip sequence) | ~1 day |
| TODO-072 | Settings panel UI redesign (tabbed modal) | ~1 day |
| TODO-073 | Rich tooltip system (styled, HTML-capable, animated) | ~4 hours |
| TODO-074 | Loading progress bar (YouTube-style, top of viewport) | ~2 hours |
| TODO-076 | Font size / density toggle (Compact / Default / Comfortable) | ~4 hours |
| TODO-078 | Map event popup card redesign (image header, action buttons) | ~1 day |
| TODO-080 | CII score donut chart visualization (animated, segmented) | ~4 hours |
| TODO-081 | Signal timeline visualization in Signal Modal | ~1 day |
| TODO-082 | Country Intelligence Profile Page (tabbed: Overview, CII, News, Military, Economic, Climate) | ~2 days |
| TODO-086 | Strategic posture visual indicators on map (colored region overlays) | ~1 day |
| TODO-087 | News panel infinite scroll | ~4 hours |
| TODO-088 | Economic panel mini-chart inline rendering | ~1 day |
| TODO-089 | Prediction market price sparklines (7-day) | ~4 hours |
| TODO-090 | Stablecoin panel historical chart (30-day peg deviation) | ~4 hours |
| TODO-091 | Panel tab navigation (internal sub-views for complex panels) | ~4 hours |
| TODO-096 | Compact header mode (minimal single-line bar) | ~4 hours |
| TODO-098 | RTL layout full audit for Arabic | ~1 day |
| TODO-101 | Multi-event comparison view (2–3 events side-by-side) | ~1 day |
| TODO-109 | Map event timeline slider (filter layers by time range) | ~1 day |
| TODO-112 | Intelligence briefing auto-summary ("Daily Briefing" button) | ~1 day |
| TODO-114 | Sidebar width drag-to-adjust | ~4 hours |
| TODO-119 | Signal priority filter dropdown (Critical/High/Medium/Low) | ~4 hours |
| TODO-121 | Country Timeline Panel (vertical event timeline) | ~1 day |
| TODO-122 | Dashboard snapshot sharing via URL | ~1 day |
| TODO-124 | Panel content pagination (100+ item panels) | ~4 hours |
| TODO-129 | Hover preview cards for map markers | ~4 hours |

---

## 🟢 Low Priority

### TODO-017 — Dark/Light Theme Toggle Improvements
Audit all CSS custom properties for light-theme counterparts. Effort: ~1 day.

### TODO-018 — PWA Offline Dashboard State
Display last snapshot data when offline with "Offline — showing cached data" banner. Effort: ~2 days.

### TODO-019 — Accessibility (a11y) Audit
ARIA roles, labels, and keyboard navigation for panels, modals, and map controls. Effort: ~3 days.

### TODO-020 — UNHCR / World Bank / IMF Data Integration
Additional humanitarian and economic data sources to strengthen CII scoring. Effort: ~2 days per source.

### TODO-021 — Automated Visual Regression Testing CI
GitHub Actions workflow with visual snapshot tests on every PR. Effort: ~1 day.

### TODO-022 — Sentry Error Tracking Configuration
Initialize Sentry in `src/main.ts` with DSN from environment variable. Effort: ~2 hours.

### TODO-023 — Satellite Fire Detection Panel Enhancements
Correlate fires near military installations or critical infrastructure — `fire_near_infrastructure` signals. Effort: ~1 day.

### TODO-024 — Keyboard-Navigable Map with Focus Management
Arrow keys for pan, `+`/`-` for zoom, `Tab` to cycle markers. Effort: ~2 days.

### TODO-025 — Data Export Improvements (Scheduled + API)
Scheduled export and a public API endpoint. Effort: ~2 days.

### Low-Priority UX Items

| TODO | Feature | Effort |
|------|---------|--------|
| TODO-031 | Panel pinning ("Always on Top") | ~4 hours |
| TODO-033 | Animated panel transitions (slide/fade) | ~4 hours |
| TODO-034 | Panel badge pulse animation on new data | ~2 hours |
| TODO-036 | Contextual right-click menu on panels | ~4 hours |
| TODO-037 | Floating Action Button (FAB) for quick actions | ~4 hours |
| TODO-040 | Global keyboard shortcuts reference sheet (`?` key) | ~2 hours |
| TODO-047 | News source credibility indicator (Tier 1/2/Unknown) | ~4 hours |
| TODO-049 | News bookmark / save for later | ~4 hours |
| TODO-051 | Map mini-compass widget | ~2 hours |
| TODO-052 | Map ruler / measurement tool | ~1 day |
| TODO-053 | Map cluster expansion animation | ~4 hours |
| TODO-057 | Map screenshot / export as PNG | ~4 hours |
| TODO-058 | Country flag icons in panel lists | ~4 hours |
| TODO-060 | Animated number counters on panel metric updates | ~2 hours |
| TODO-075 | Custom accent color picker | ~4 hours |
| TODO-077 | High-contrast accessibility mode | ~4 hours |
| TODO-079 | Sticky panel header on scroll | ~2 hours |
| TODO-083 | Dark map popup styling (consistent dark theme) | ~2 hours |
| TODO-084 | Animated globe spinner for initial load | ~4 hours |
| TODO-085 | Panel export as image (PNG/SVG) | ~4 hours |
| TODO-092 | Glassmorphism panel headers (backdrop-filter blur) | ~2 hours |
| TODO-093 | Map layer opacity sliders | ~4 hours |
| TODO-094 | Typewriter effect for AI insight text | ~2 hours |
| TODO-095 | Interactive tutorial for map layers (? button per layer) | ~1 day |
| TODO-097 | Live news panel video thumbnail previews with LIVE dot | ~4 hours |
| TODO-099 | Customizable dashboard presets ("DefCon View", "Market Watch") | ~1 day |
| TODO-100 | Story share card redesign (map snapshot, CII score, branding) | ~4 hours |
| TODO-102 | Map bookmark / saved views | ~4 hours |
| TODO-103 | Country flag overlay on map at country zoom level | ~4 hours |
| TODO-104 | Panel content text selection + copy (fix CSS blocking) | ~2 hours |
| TODO-105 | CII alert sound toggle (subtle tone at score >80) | ~2 hours |
| TODO-106 | Map night/day terminator line (real-time) | ~4 hours |
| TODO-107 | Map clock widget (multi-timezone: UTC + 2 user zones) | ~4 hours |
| TODO-108 | Gradient heat indicator for CII panel rows | ~2 hours |
| TODO-110 | Micro-interaction: panel expand ripple effect | ~1 hour |
| TODO-111 | Context menu on map markers (right-click) | ~4 hours |
| TODO-113 | Popover quick stats on header metric counters | ~4 hours |
| TODO-115 | Animated data flow visualization on map (trade routes, pipelines) | ~2 days |
| TODO-116 | Regional zoom presets (Middle East, Europe, East Asia, Global) | ~4 hours |
| TODO-117 | Panel grouping by data freshness | ~4 hours |
| TODO-118 | Inline panel help text ("How to interpret") | ~4 hours |
| TODO-120 | Animated SVG map marker icons by event type | ~4 hours |
| TODO-123 | Color-blind safe palette (blue/orange + patterns) | ~4 hours |
| TODO-125 | Map drawing tools (circles, lines, polygons for annotations) | ~2 days |
| TODO-126 | Quick currency / unit converter widget | ~4 hours |
| TODO-127 | Panel dependency graph view (node graph of data flow) | ~1 day |
| TODO-128 | Map 3D building extrusion mode at city zoom | ~4 hours |
| TODO-130 | Event sound effects (optional, off by default) | ~2 hours |

---

*Last updated: 2026-03-10*
