/**
 * AutoFollowEngine — Intelligent auto-pilot for God's Eye camera.
 *
 * Reads entity positions from GlobeDataManager's CustomDataSources,
 * scores them by layer importance (mode-weighted), and flies the camera
 * to the highest-priority targets in a cycle.
 *
 * Mode awareness:
 *  - War mode   → prioritize conflicts, airstrikes, military
 *  - Disaster   → prioritize earthquakes, GDACS, volcanoes, cyclones, fires
 *  - Finance    → overview orbit, minimal fly-to
 *  - Peace/Ghost → balanced scoring
 */

import {
  Cartesian3,
  Cartographic,
  JulianDate,
  Math as CesiumMath,
  type Viewer,
  type Entity,
  type CustomDataSource,
} from 'cesium';
import type { AppMode } from '@/services/mode-manager';

export interface FollowTarget {
  id: string;
  layer: string;
  name: string;
  lat: number;
  lon: number;
  score: number;
}

/** Recency bonus: entities updated within this window get the full bonus. */
const RECENCY_FULL_MS = 5 * 60 * 1000;
/** Recency bonus magnitude (added to score for very fresh entities). */
const RECENCY_BONUS = 1.5;
/** Visited-recently penalty: how long a visit suppresses re-selection. */
const VISITED_PENALTY_MS = 4 * 60 * 1000;
/** Maximum penalty subtracted from score for a freshly-visited target. */
const VISITED_PENALTY = 2;
/** Severity-proxy weight (multiplied into base layer weight). */
const SEVERITY_WEIGHT = 1;

export interface AutoFollowOptions {
  cycleIntervalMs?: number;   // default: 12000 (12s)
  flyDurationSec?: number;    // default: 2.5
  altitudeMeters?: number;    // default: 2_500_000 (2500 km)
}

const DEFAULT_CYCLE_MS = 12_000;
const DEFAULT_FLY_DURATION = 2.5;
const DEFAULT_ALT = 2_500_000;

/** Per-layer base importance (higher = more likely to be followed). */
const LAYER_WEIGHTS: Record<string, number> = {
  earthquakes: 3,
  gdacs: 4,
  conflicts: 3,
  airstrikes: 4,
  volcanoes: 3,
  cyclones: 4,
  fires: 2,
  flights: 1.5,
  vessels: 1,
  darkVessels: 2.5,
  nuclear: 1,
  cyber: 1.5,
  gpsJamming: 2,
  protests: 1.5,
  disease: 1,
  displacement: 1,
  hotspots: 2,
  satChange: 2,
};

/** Mode-specific multipliers for layer weights. */
const MODE_MULTIPLIERS: Record<AppMode, Record<string, number>> = {
  war: {
    conflicts: 2.5, airstrikes: 3, flights: 2, vessels: 2, darkVessels: 2,
    gpsJamming: 2, nuclear: 1.5, hotspots: 2,
    earthquakes: 0.3, gdacs: 0.5, fires: 0.2, cyclones: 0.3,
  },
  disaster: {
    earthquakes: 3, gdacs: 3, volcanoes: 3, cyclones: 3, fires: 2.5,
    conflicts: 0.3, airstrikes: 0.3, flights: 0.3,
  },
  finance: {
    // Everything scaled down — finance mode prefers overview orbit
    earthquakes: 0.3, gdacs: 0.5, conflicts: 0.3, airstrikes: 0.3,
  },
  peace: {},
  ghost: {},
};

/** Deterministic 0-1 value from a string, used for stable jitter. */
function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.trunc((h << 5) - h + (s.codePointAt(i) ?? 0));
  }
  return Math.abs(h % 1000) / 1000;
}

function entityToLatLon(entity: Entity): { lat: number; lon: number } | null {
  const pos = entity.position;
  if (!pos) return null;
  try {
    const cart = pos.getValue(JulianDate.fromDate(new Date()));
    if (!cart) return null;
    const carto = Cartographic.fromCartesian(cart);
    return {
      lat: CesiumMath.toDegrees(carto.latitude),
      lon: CesiumMath.toDegrees(carto.longitude),
    };
  } catch {
    return null;
  }
}

/**
 * Extract a per-entity severity proxy. Reads `severity` from the entity's
 * PropertyBag if present (entities that opted in), otherwise falls back to
 * billboard scale (which is itself derived from magnitude/alert-level for
 * earthquake/GDACS/conflict layers). Returns a multiplier in roughly [0.5, 3].
 */
function entitySeverityProxy(entity: Entity, julian: JulianDate): number {
  try {
    const bag = entity.properties?.getValue(julian) as { severity?: unknown } | undefined;
    const explicit = bag?.severity;
    if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
      return Math.max(0.5, Math.min(3, explicit));
    }
  } catch { /* fall through to billboard proxy */ }
  const scale: unknown = entity.billboard?.scale?.getValue(julian);
  if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) {
    return Math.max(0.5, Math.min(3, scale * 2));
  }
  return 1;
}

/**
 * Score bonus for fresh entities. Full bonus inside RECENCY_FULL_MS,
 * tapering linearly to zero by 4× that window.
 */
function recencyBonus(tsMs: number | null, nowMs: number): number {
  if (tsMs === null) return 0;
  const ageMs = nowMs - tsMs;
  if (ageMs <= RECENCY_FULL_MS) return RECENCY_BONUS;
  if (ageMs >= RECENCY_FULL_MS * 4) return 0;
  return RECENCY_BONUS * (1 - (ageMs - RECENCY_FULL_MS) / (RECENCY_FULL_MS * 3));
}

/**
 * Extract entity timestamp (last-updated) in ms epoch from PropertyBag.
 * Returns null if no timestamp is set.
 */
function entityTimestampMs(entity: Entity, julian: JulianDate): number | null {
  try {
    const bag = entity.properties?.getValue(julian) as { timestamp?: Date | string | number } | undefined;
    const ts = bag?.timestamp;
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
    if (typeof ts === 'string') {
      const parsed = Date.parse(ts);
      return Number.isFinite(parsed) ? parsed : null;
    }
  } catch { /* none */ }
  return null;
}

export class AutoFollowEngine {
  private viewer: Viewer;
  private targets: FollowTarget[] = [];
  private currentIndex = 0;
  private cycleTimer: ReturnType<typeof setInterval> | null = null;
  private _active = false;
  private mode: AppMode = 'peace';
  private opts: Required<AutoFollowOptions>;
  private onTargetChange: ((target: FollowTarget | null, index: number, total: number) => void) | null = null;
  private dataSources: () => Map<string, CustomDataSource>;
  /** Map of entity-id → ms epoch of last visit (for diversification penalty). */
  private visitedAt = new Map<string, number>();

  constructor(
    viewer: Viewer,
    dataSources: () => Map<string, CustomDataSource>,
    options?: AutoFollowOptions,
  ) {
    this.viewer = viewer;
    this.dataSources = dataSources;
    this.opts = {
      cycleIntervalMs: options?.cycleIntervalMs ?? DEFAULT_CYCLE_MS,
      flyDurationSec: options?.flyDurationSec ?? DEFAULT_FLY_DURATION,
      altitudeMeters: options?.altitudeMeters ?? DEFAULT_ALT,
    };
  }

  get active(): boolean {
    return this._active;
  }

  get currentTarget(): FollowTarget | null {
    return this.targets[this.currentIndex] ?? null;
  }

  get targetCount(): number {
    return this.targets.length;
  }

  setMode(mode: AppMode): void {
    this.mode = mode;
  }

  setOnTargetChange(cb: (target: FollowTarget | null, index: number, total: number) => void): void {
    this.onTargetChange = cb;
  }

  start(): void {
    if (this._active) return;
    this._active = true;
    this.currentIndex = 0;
    this.refreshTargets();

    if (this.targets.length > 0) {
      this.flyToCurrentTarget();
    }

    this.cycleTimer = setInterval(() => {
      this.refreshTargets();
      this.advanceToNext();
    }, this.opts.cycleIntervalMs);
  }

  stop(): void {
    if (!this._active) return;
    this._active = false;
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
    this.onTargetChange?.(null, 0, 0);
  }

  toggle(): void {
    if (this._active) this.stop();
    else this.start();
  }

  skipToNext(): void {
    if (!this._active) return;
    this.advanceToNext();
  }

  /**
   * Refresh targets relative to a specific playback time. Used by 4D
   * AI Director mode so the camera follows what was important at the
   * point in time being played back, not just wall-clock NOW.
   *
   * Today this delegates to the standard refresh — temporal scoring
   * (weighting entities by how close their timestamp is to playbackMs)
   * lands once entity timestamp metadata is uniformly available across
   * data sources. The hook exists so the playback engine can call it
   * without further plumbing.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  refreshAtTime(_playbackMs: number): void {
    this.refreshTargets();
    if (this.targets.length > 0 && this._active) {
      this.flyToCurrentTarget();
    }
  }

  private refreshTargets(): void {
    const scored: FollowTarget[] = [];
    const sources = this.dataSources();
    const julian = JulianDate.fromDate(new Date());
    const nowMs = Date.now();

    this.pruneVisitLog(nowMs);

    for (const [layerName, source] of sources) {
      if (!source.show) continue;
      const weight = (LAYER_WEIGHTS[layerName] ?? 1) * (MODE_MULTIPLIERS[this.mode]?.[layerName] ?? 1);
      if (weight < 0.5) continue;

      const entities = source.entities.values;
      const step = Math.max(1, Math.floor(entities.length / 10));
      for (let i = 0; i < entities.length; i += step) {
        const entity = entities[i]!;
        const target = this.scoreEntity(entity, layerName, weight, julian, nowMs);
        if (target) scored.push(target);
      }
    }

    scored.sort((a, b) => b.score - a.score);
    this.targets = scored.slice(0, 30);
  }

  private pruneVisitLog(nowMs: number): void {
    const visitTtlMs = 8 * 60 * 60 * 1000;
    for (const [id, visitedMs] of this.visitedAt) {
      if (nowMs - visitedMs > visitTtlMs) this.visitedAt.delete(id);
    }
  }

  private scoreEntity(
    entity: Entity,
    layerName: string,
    weight: number,
    julian: JulianDate,
    nowMs: number,
  ): FollowTarget | null {
    const loc = entityToLatLon(entity);
    if (!loc) return null;

    const severity = entitySeverityProxy(entity, julian);
    let score = weight * (1 + (severity - 1) * SEVERITY_WEIGHT);
    score += recencyBonus(entityTimestampMs(entity, julian), nowMs);
    score -= this.visitedPenalty(entity.id, nowMs);
    score += simpleHash(entity.id) * 0.25;

    return {
      id: entity.id,
      layer: layerName,
      name: (entity.description?.getValue(julian) as string) ?? entity.name ?? layerName,
      lat: loc.lat,
      lon: loc.lon,
      score,
    };
  }

  private visitedPenalty(id: string, nowMs: number): number {
    const visitedMs = this.visitedAt.get(id);
    if (visitedMs === undefined) return 0;
    const sinceVisit = nowMs - visitedMs;
    if (sinceVisit >= VISITED_PENALTY_MS) return 0;
    const factor = 1 - sinceVisit / VISITED_PENALTY_MS;
    return VISITED_PENALTY * factor;
  }

  private advanceToNext(): void {
    if (this.targets.length === 0) {
      this.onTargetChange?.(null, 0, 0);
      return;
    }
    this.currentIndex = (this.currentIndex + 1) % this.targets.length;
    this.flyToCurrentTarget();
  }

  private flyToCurrentTarget(): void {
    const target = this.targets[this.currentIndex];
    if (!target) return;

    this.viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(target.lon, target.lat, this.opts.altitudeMeters),
      duration: this.opts.flyDurationSec,
    });
    this.visitedAt.set(target.id, Date.now());
    this.onTargetChange?.(target, this.currentIndex, this.targets.length);
  }

  /** Return the top-N priority targets using the current mode weights.
   *  Safe to call at any time — triggers a fresh scoring pass. */
  getPriorityTargets(n: number): FollowTarget[] {
    this.refreshTargets();
    return this.targets.slice(0, n);
  }

  destroy(): void {
    this.stop();
    this.onTargetChange = null;
    this.visitedAt.clear();
  }
}
