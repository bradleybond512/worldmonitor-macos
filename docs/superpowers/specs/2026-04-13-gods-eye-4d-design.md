# God's Eye 4D Mode — Design Spec

**Date:** 2026-04-13
**Status:** Approved
**Scope:** Add temporal depth (4D) to the God's Eye 3D globe view

---

## Overview

Transform God's Eye from a spatial snapshot into a temporal experience. Time becomes a visible, navigable, interactive dimension — not just a hidden filter. The system uses context-adaptive visualization (different 4D language per data type), a two-tier activation model (ambient atmosphere on toggle, deep analysis on interaction), and three cinematic playback modes.

## Activation Model

### Tier 1: Ambient 4D (Toggle — `T` key)

When toggled on, these features activate globally:

- **Multi-lane swimlane timeline** replaces the simple scrubber at screen bottom
- **Entity trails** — fading comet tails on all moving entities
- **Intensity pillars** — vertical bars on conflicts/disasters encoding duration and severity
- **Reality degradation** — future entities render with decreasing fidelity based on confidence
- **Playback mode selector** — Documentary / AI Director / Heartbeat

### Tier 2: Deep Analysis (Hover/Click)

These appear only on direct interaction with entities:

- **Prediction cones / probability fields** — on hover
- **Branching timelines** — scenario forks on click
- **Escalation halos** — conflict zone expansion probability on hover
- **Aftershock zones** — earthquake probability field on click

Tier 2 overlays dismissed with `Esc` or clicking elsewhere. Max 1 active prediction + 1 branching overlay at a time.

---

## Multi-Lane Swimlane Timeline

**Component:** `GlobeSwimlane.ts`
**Replaces:** `GlobeTimeMachine.ts` simple scrubber (when 4D active)

### Lanes

Six category lanes, each with its own color:

| Lane | Color | Content |
|------|-------|---------|
| CONFLICTS | `#ff3333` | Battle/explosion events, airstrike clusters |
| DISASTERS | `#ffa500` | GDACS alerts, cyclones, floods |
| MILITARY | `#00c8ff` | Flight activity windows, vessel movements |
| SEISMIC | `#ffc800` | Earthquake events, aftershock sequences |
| CYBER | `#00ffaa` | Threat campaigns, C2 activity bursts |
| WEATHER | `#8682ff` | Continuous severity gradient bar |

### Visual Encoding

- **Solid blocks** = confirmed past events
- **Dashed/gradient blocks** = forecasted events
- **Block width** = event duration on the time axis
- **Vertical NOW line** = glowing cyan divider, draggable for time scrubbing

### Zoom Presets

Pill buttons: `1h` | `6h` | `24h` | `7d` | `30d`
Plus continuous scroll-zoom on the swimlane area. Time axis labels update dynamically with zoom level.

### Header Controls

Left side: "4D TIMELINE" label + zoom preset pills
Right side: playback transport (⏮ ▶ ⏭) + speed pills (1× 4× 16× 64×) + mode pills (DOC AI PULSE) + collapse button (▼)

### Interactions

| Action | Effect |
|--------|--------|
| Click event block | Camera flies to that event on globe; opens Tier 2 deep analysis |
| Drag NOW line | Scrubs time; all globe entities update; degradation shifts |
| Scroll-zoom on swimlane | Zooms temporal resolution continuously |
| Hover event block | Tooltip with event name, time range, severity; entity highlights on globe |
| Collapse (▼) | Shrinks to single-lane density bar; ambient 4D stays on globe |
| Lane label click | Toggles that category's globe layer visibility |

### Collapsed State

Single-lane density sparkline showing aggregate event density across all categories. Same playback controls. Expands back to full swimlane on click.

---

## Playback Modes

**Component:** `GlobePlayback.ts`

### Documentary Mode (default)

- Steady time flow at selected speed multiplier
- Camera stays where user placed it
- Events appear/fade smoothly with natural transitions
- Use case: monitoring, passive observation

### AI Director Mode

- AutoFollowEngine drives the camera during playback
- Flies to top-scored events as they appear in the timeline
- Mode-aware: War mode prioritizes conflicts/airstrikes, Disaster mode chases earthquakes/cyclones
- Existing `AutoFollowEngine.ts` scoring and targeting logic, integrated with temporal playback
- Use case: briefings, demos, catching up on what happened

### Heartbeat Mode

- Time pacing driven by event density in the swimlane
- Dense event clusters → playback slows down (lingers)
- Sparse gaps → playback fast-forwards
- Swimlane bar heights/density drive the tempo
- Camera: user-controlled or optionally combined with AutoFollow
- Use case: analysis, finding the important moments

---

## Globe Visual Effects

### Entity Trails — `GlobeTrails.ts`

Context-adaptive trail rendering per layer type:

| Layer | Trail Type | Window |
|-------|-----------|--------|
| Military flights | Polyline comet tail | 6h |
| Military vessels | Wake trail with AIS-off gaps | 12h |
| Cyclones | Full lifecycle path | Full lifecycle |
| Satellites | Orbital arc segment | 1 orbit |

**Rendering:** Cesium `PolylineCollection` with `PolylineFadeMaterialProperty` for GPU-accelerated fading. Trail opacity fades from head (bright) to tail (transparent).

**Limits:** Max 200 active trails. LOD: reduce trail point density at far zoom distances.

**Storage:** Per-entity `Float64Array` ring buffers (lat, lon, time). Max 50 points per trail × 200 entities ≈ 240KB.

### Intensity Pillars — `GlobePillars.ts`

Vertical bars rising from the globe surface at event locations:

- **Height** = event duration (taller = longer-running)
- **Width** = severity (wider = more severe)
- **Color** = category (matches lane colors)
- **Gradient:** Opaque at base, fading to transparent at top

**Applicable to:** Conflicts, disasters, GDACS alerts, large earthquakes.

**Rendering:** Cesium `Primitive` with `GeometryInstance` batching — single draw call for all pillars. Max 100 pillars. Fade out beyond camera distance threshold.

### Reality Degradation — `GlobeDegradation.ts`

A rendering pipeline that degrades entity visual fidelity as confidence decreases across the NOW boundary:

```
confidence = clamp(1.0 - (timeFromNow / layerMaxForecast), 0.05, 1.0)
opacity    = confidence × baseOpacity
strokeDash = confidence < 0.5 ? [4, 4 × (1 - confidence)] : solid
blur       = confidence < 0.3 ? (1 - confidence) × 2 : 0
jitter     = confidence < 0.2 ? (1 - confidence) × 4 : 0  // position noise in px
```

**Three zones:**

| Zone | Time Range | Rendering |
|------|-----------|-----------|
| Past (confirmed) | Before NOW | Solid fill, sharp edges, opaque trails, crisp labels |
| Near future (high confidence) | +1h to +24h | Outlined, semi-transparent, dashed paths, faded labels |
| Far future (low confidence) | +24h to +7d | Dashed outlines, ghostly, barely visible paths, labels hidden unless hovered |

**Performance:** Confidence computed per entity on time change, debounced 250ms (matching existing `applyTimeFilter`). Cached until next time step.

### Prediction Cones — `GlobePredictions.ts`

Tier 2 (hover/click only). Layer-specific probability visualizations:

| Layer | Prediction Type | Source |
|-------|----------------|--------|
| Cyclones | NHC-style expanding cone with probable path | NHC/JTWC advisory data from GDACS feed |
| Earthquakes | Concentric aftershock probability rings | USGS ETAS model (Reasenberg-Jones), computed locally |
| Conflicts | Escalation halos — expanding rings, wider = more uncertain | EMA forecast engine (existing `ema-forecast.ts`) |
| Flights | Heading prediction cone (great-circle extrapolation) | Bearing + speed from current position |
| Fires | Wind-driven spread projection | NASA FIRMS + weather wind vectors |
| Vessels | Destination prediction arc | AIS destination field + heading |

**Rendering:** `PolygonGraphics` with translucent materials for cones/zones. Max 1 active at a time.

### Branching Timelines — `GlobeBranching.ts`

Tier 2 (click only). Scenario forks visualized as diverging paths from an entity:

- Each branch = a possible future outcome
- **Thickness** encodes probability (thicker = more likely)
- **Brightness** encodes probability (brighter = more likely)
- **Color** encodes outcome type (green = de-escalation, yellow = status quo, red = escalation)
- Hover a branch to see conditions that lead to that outcome

Applicable primarily to conflicts (escalate/stalemate/de-escalate) and cyclones (track variations).

**Data:** Conflict branching uses EMA forecast trend data. Cyclone branching uses ensemble model spread from NHC advisories.

---

## Adaptive Time Windows

Each layer uses its own natural temporal range:

| Layer | Past Window | Forecast Window |
|-------|-------------|-----------------|
| Military flights | 6h | — |
| Military vessels | 12h | — |
| Conflicts | 7d | 7d |
| Earthquakes | 30d | 30d |
| Cyclones | Full lifecycle | 5d (NHC cone) |
| GDACS disasters | 14d | 48h |
| Fires | 7d | 48h |
| Cyber threats | 7d | — |
| GPS jamming | 7d | — |

The swimlane zoom level determines which layers show detail. At 1h zoom, only short-window layers show individual events; long-window layers compress to density bars.

---

## HUD Updates

**Component:** `GlobeHUD.ts`

New pills added to the top-left HUD card when 4D is active:

- **4D badge** — purple, indicates 4D mode is on
- **Playback mode + speed** — e.g., "DOC ▶ 16×" or "AI ▶ 4×" or "PULSE ▶"
- **Temporal offset** — "VIEWING: -2h 14m" when scrubbed to past; hidden when at NOW
- **Trail count** — "TRAILS: 47" — number of active entity trails
- **Forecast count** — "FORECAST: 12" — number of forecast entities currently rendered

---

## Keyboard Shortcuts

| Key | Action | Status |
|-----|--------|--------|
| `T` | Toggle 4D mode (Tier 1) | NEW |
| `D` | Documentary playback mode | NEW (4D only) |
| `I` | AI Director playback mode | NEW (4D only) |
| `H` | Heartbeat playback mode | NEW (4D only) |
| `Tab` | Expand / collapse swimlane | NEW |
| `[` / `]` | Zoom swimlane time window in/out | NEW |
| `N` | Snap to NOW | NEW |
| `Esc` | Dismiss Tier 2 analysis overlay | NEW |
| `Space` | Play/pause (now uses active playback mode) | MODIFIED |
| `←` / `→` | Step time (adapts to swimlane zoom level) | MODIFIED |

All new shortcuts only active when in God's Eye view. Playback mode shortcuts (`D`/`I`/`H`) only active when 4D is toggled on.

---

## File Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/components/gods-eye/Globe4DManager.ts` | Orchestrates all 4D features, manages toggle state, coordinates sub-components |
| `src/components/gods-eye/GlobeTrails.ts` | Comet trail rendering via PolylineCollection |
| `src/components/gods-eye/GlobePillars.ts` | Vertical intensity bars via instanced Primitive geometry |
| `src/components/gods-eye/GlobePredictions.ts` | Probability cones, escalation halos, aftershock zones |
| `src/components/gods-eye/GlobeBranching.ts` | Scenario fork visualization |
| `src/components/gods-eye/GlobeDegradation.ts` | Reality degradation rendering pipeline |
| `src/components/gods-eye/GlobeSwimlane.ts` | Multi-lane timeline UI (HTML/CSS overlay) |
| `src/components/gods-eye/GlobePlayback.ts` | Documentary/Director/Heartbeat playback engines |
| `src/services/forecast-engine.ts` | Prediction data aggregation from all sources |

### Modified Files

| File | Changes |
|------|---------|
| `src/components/GodsEyeView.ts` | 4D toggle (`T` key), wire up Globe4DManager, new keyboard shortcuts |
| `src/components/GlobeTimeMachine.ts` | Adapt to feed swimlane data, support adaptive time windows per layer |
| `src/components/GlobeDataManager.ts` | Expose entity timestamps and position history for trail/pillar rendering |
| `src/components/GlobeHUD.ts` | 4D mode indicator badge, playback mode pill, temporal offset, trail/forecast counts |
| `src/components/gods-eye/AutoFollowEngine.ts` | AI Director playback integration — accept time-driven target updates |

---

## Performance Budget

| System | Constraint | Strategy |
|--------|-----------|----------|
| Trails | Max 200 active | PolylineCollection, LOD at distance, ring buffer storage |
| Pillars | Max 100 active | Instanced geometry, single draw call, distance fade |
| Predictions | Max 1 active | Tier 2 only, computed on demand |
| Degradation | <2ms per time step | Cached confidence values, debounced 250ms |
| Swimlane | DOM-based | HTML/CSS overlay, RAF for NOW line, re-render on data change only |
| Memory | <5MB total 4D overhead | Float64Array ring buffers, typed arrays for swimlane |
| Frame budget | <2ms per frame | No per-frame computation; all updates event-driven or debounced |

---

## Out of Scope

- Finance/markets data on God's Eye (explicit user mandate)
- AI/ML-powered prediction models (forecasts use existing data sources and simple statistical models)
- Multi-user shared timeline state
- Recording/export of 4D playback sessions
