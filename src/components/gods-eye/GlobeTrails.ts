/**
 * GlobeTrails — comet-tail polyline trails behind moving entities.
 *
 * Each tracked entity gets a Cesium PolylineGraphics fed by a Float64Array
 * ring buffer of (lon, lat, timeMs) tuples. Buffer length is bounded by
 * MAX_POINTS_PER_TRAIL; total trail count is bounded by MAX_TRAILS. Points
 * older than the per-layer window are trimmed on each refresh tick.
 *
 * Trails are added/removed in lockstep with the entities surfaced by
 * GlobeDataManager.getEntityPositionHistory(). When an entity disappears
 * (filtered out, exited the time window, deleted), its trail is removed in
 * the next refresh.
 *
 * Plan: docs/superpowers/plans/2026-04-13-gods-eye-4d.md (Task 6)
 */

import {
  Cartesian3,
  Color,
  CustomDataSource,
  Entity,
  CallbackProperty,
  PolylineGraphics,
  type MaterialProperty,
  type Viewer,
} from 'cesium';
import type { GlobeDataManager } from '@/components/GlobeDataManager';

interface TrailConfig {
  layerName: string;
  windowMs: number;
  color: Color;
  width: number;
}

const TRAIL_CONFIGS: readonly TrailConfig[] = [
  { layerName: 'flights',     windowMs:  6 * 3_600_000, color: Color.fromCssColorString('#00c8ff'), width: 2 },
  { layerName: 'vessels',     windowMs: 12 * 3_600_000, color: Color.fromCssColorString('#4488ff'), width: 1.5 },
  { layerName: 'darkVessels', windowMs: 12 * 3_600_000, color: Color.fromCssColorString('#ff4444'), width: 1.5 },
  { layerName: 'cyclones',    windowMs:  7 * 86_400_000, color: Color.fromCssColorString('#ffa500'), width: 3 },
];

const MAX_TRAILS = 200;
const MAX_POINTS_PER_TRAIL = 50;
const REFRESH_MS = 5000;
const POINT_STRIDE = 3; // [lon, lat, timeMs]

interface TrailEntry {
  entityId: string;
  layerName: string;
  buffer: Float64Array;
  head: number;
  count: number;
  cesiumEntity: Entity;
}

export class GlobeTrails {
  private viewer: Viewer;
  private dataManager: GlobeDataManager;
  private source: CustomDataSource;
  private trails = new Map<string, TrailEntry>();
  private destroyed = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(viewer: Viewer, dataManager: GlobeDataManager) {
    this.viewer = viewer;
    this.dataManager = dataManager;
    this.source = new CustomDataSource('4d-trails');
  }

  mount(): void {
    this.viewer.dataSources.add(this.source).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[GlobeTrails] dataSources.add failed', error);
    });
    this.refresh();
    this.refreshTimer = setInterval(() => {
      if (!this.destroyed) this.refresh();
    }, REFRESH_MS);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.viewer.dataSources.remove(this.source, true);
    this.trails.clear();
  }

  get activeTrailCount(): number { return this.trails.size; }

  private refresh(): void {
    const seenIds = new Set<string>();

    for (const config of TRAIL_CONFIGS) {
      const positions = this.dataManager.getEntityPositionHistory(config.layerName);
      for (const pos of positions) {
        if (this.trails.size >= MAX_TRAILS && !this.trails.has(pos.id)) continue;
        seenIds.add(pos.id);
        let trail = this.trails.get(pos.id);
        if (!trail) {
          trail = this.createTrail(pos.id, config);
          this.trails.set(pos.id, trail);
        }
        this.pushPoint(trail, pos.lon, pos.lat, pos.timeMs, config.windowMs);
      }
    }

    // Drop trails whose entity disappeared.
    for (const [id, trail] of this.trails) {
      if (!seenIds.has(id)) {
        this.source.entities.remove(trail.cesiumEntity);
        this.trails.delete(id);
      }
    }
  }

  private createTrail(entityId: string, config: TrailConfig): TrailEntry {
    const buffer = new Float64Array(MAX_POINTS_PER_TRAIL * POINT_STRIDE);
    const trailColor = config.color.withAlpha(0.7);

    const cesiumEntity = this.source.entities.add(new Entity({
      polyline: new PolylineGraphics({
        positions: new CallbackProperty(() => this.getTrailPositions(entityId), false),
        width: config.width,
        material: new CallbackProperty(() => trailColor, false) as unknown as MaterialProperty,
        clampToGround: true,
      }),
    }));

    return {
      entityId,
      layerName: config.layerName,
      buffer,
      head: 0,
      count: 0,
      cesiumEntity,
    };
  }

  private pushPoint(trail: TrailEntry, lon: number, lat: number, timeMs: number, windowMs: number): void {
    const idx = trail.head * POINT_STRIDE;
    trail.buffer[idx] = lon;
    trail.buffer[idx + 1] = lat;
    trail.buffer[idx + 2] = timeMs;
    trail.head = (trail.head + 1) % MAX_POINTS_PER_TRAIL;
    if (trail.count < MAX_POINTS_PER_TRAIL) trail.count++;

    const cutoff = Date.now() - windowMs;
    while (trail.count > 0) {
      const oldest = ((trail.head - trail.count + MAX_POINTS_PER_TRAIL) % MAX_POINTS_PER_TRAIL) * POINT_STRIDE;
      if ((trail.buffer[oldest + 2] ?? 0) >= cutoff) break;
      trail.count--;
    }
  }

  private getTrailPositions(entityId: string): Cartesian3[] {
    const trail = this.trails.get(entityId);
    if (!trail || trail.count === 0) return [];
    const positions: Cartesian3[] = [];
    for (let i = 0; i < trail.count; i++) {
      const idx = ((trail.head - trail.count + i + MAX_POINTS_PER_TRAIL) % MAX_POINTS_PER_TRAIL) * POINT_STRIDE;
      positions.push(Cartesian3.fromDegrees(trail.buffer[idx] ?? 0, trail.buffer[idx + 1] ?? 0));
    }
    return positions;
  }
}
