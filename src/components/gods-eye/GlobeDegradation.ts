/**
 * GlobeDegradation — reality-degradation rendering pipeline.
 *
 * Computes per-entity confidence based on how far ahead of NOW the entity's
 * timestamp sits, then applies opacity / dash / blur / jitter rules:
 *   • confidence = 1                     → crisp past event
 *   • 0.5 ≤ confidence < 1               → near future, full color, slight fade
 *   • 0.3 ≤ confidence < 0.5             → dashed paths, faded labels
 *   • confidence < 0.3                   → blurred, ghostly
 *   • confidence < 0.2                   → jitter the billboard offset by ±jitter px
 *
 * Decay is exponential: confidence(t) = exp(-t / τ_layer), with τ tuned per
 * layer (fast-moving GDACS/fires decay quicker than 30-day earthquake horizon).
 *
 * ConstantProperty instances are reused per-entity via setValue() to avoid
 * garbage churn on each TimeMachine tick.
 */

import {
  Cartesian2,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  JulianDate,
  PolylineDashMaterialProperty,
  type Entity,
  type Viewer,
} from 'cesium';
import type { GlobeDataManager } from '@/components/GlobeDataManager';

/* eslint-disable @typescript-eslint/no-unused-vars -- viewer kept on the
 * constructor for future Cesium-primitive trail/path degradation; today's
 * implementation only mutates per-entity properties from the data sources. */

const DAY_MS = 86_400_000;

/**
 * Per-layer exponential time constant τ (ms). Confidence at t=τ is e⁻¹ ≈ 0.37,
 * at t=2τ ≈ 0.14, at t=3τ ≈ 0.05 (the floor). Tuned so the effective horizon
 * is roughly 3τ — matches the previous linear cutoffs at the same point.
 */
const LAYER_DECAY_TAU_MS: Record<string, number> = {
  conflicts:   2.33 * DAY_MS,  // ~7d effective
  airstrikes:  2.33 * DAY_MS,
  earthquakes: 10 * DAY_MS,    // ~30d effective
  gdacs:       0.67 * DAY_MS,  // ~2d effective
  cyclones:    1.67 * DAY_MS,  // ~5d effective
  fires:       0.67 * DAY_MS,
};

const CONFIDENCE_FLOOR = 0.05;
const DASH_THRESHOLD = 0.5;
const BLUR_THRESHOLD = 0.3;
const JITTER_THRESHOLD = 0.2;
const LABEL_THRESHOLD = 0.3;

/** Pixel jitter magnitude at maximum jitter (state.jitter = 1). */
const JITTER_MAX_PX = 6;

export interface DegradationState {
  confidence: number;
  opacity: number;
  isDashed: boolean;
  blur: number;
  jitter: number;
}

interface EntityPropertyCache {
  billboardColor?: ConstantProperty;
  billboardScale?: ConstantProperty;
  billboardPixelOffset?: ConstantProperty;
  pointColor?: ConstantProperty;
  pointPixelSize?: ConstantProperty;
  labelShow?: ConstantProperty;
  polylineDashMaterial?: PolylineDashMaterialProperty;
  polylineSolidMaterial?: ColorMaterialProperty;
  polylineMaterialColor?: ConstantProperty;
  polylineWasDashed?: boolean;
  jitterSeed?: number;
}

export class GlobeDegradation {
  private dataManager: GlobeDataManager;
  private cache = new Map<string, DegradationState>();
  private propCache = new Map<string, EntityPropertyCache>();
  private destroyed = false;

  constructor(_viewer: Viewer, dataManager: GlobeDataManager) {
    this.dataManager = dataManager;
  }

  /**
   * Recompute degradation for every visible forecast-able entity relative to
   * `currentMs` (typically TimeMachine.getCurrentMs()). The caller is expected
   * to debounce this — the existing 250 ms TimeMachine debounce is a fine fit.
   */
  applyDegradation(currentMs: number): void {
    if (this.destroyed) return;
    this.cache.clear();
    const sources = this.dataManager.getDataSources();

    for (const [layerName, tau] of Object.entries(LAYER_DECAY_TAU_MS)) {
      const entities = this.dataManager.getLayerEntitiesWithTimestamps(layerName);
      const source = sources.get(layerName);
      if (!source) continue;

      for (const e of entities) {
        const timeFromNow = e.timeMs - currentMs;
        const state = timeFromNow <= 0
          ? { confidence: 1, opacity: 1, isDashed: false, blur: 0, jitter: 0 }
          : GlobeDegradation.computeState(timeFromNow, tau);
        this.cache.set(e.id, state);

        const cesium = source.entities.getById(e.id);
        if (cesium) this.applyToEntity(e.id, cesium, state);
      }
    }
  }

  getState(entityId: string): DegradationState | undefined {
    return this.cache.get(entityId);
  }

  /** Number of entities currently rendered with degraded confidence (< 1). */
  get forecastEntityCount(): number {
    let count = 0;
    for (const state of this.cache.values()) {
      if (state.confidence < 1) count++;
    }
    return count;
  }

  destroy(): void {
    this.destroyed = true;
    this.cache.clear();
    this.propCache.clear();
  }

  static computeState(timeFromNowMs: number, tauMs: number): DegradationState {
    if (tauMs <= 0 || timeFromNowMs <= 0) {
      return { confidence: 1, opacity: 1, isDashed: false, blur: 0, jitter: 0 };
    }
    const raw = Math.exp(-timeFromNowMs / tauMs);
    const confidence = Math.max(CONFIDENCE_FLOOR, Math.min(1, raw));
    return {
      confidence,
      opacity: confidence,
      isDashed: confidence < DASH_THRESHOLD,
      blur: confidence < BLUR_THRESHOLD ? (1 - confidence) * 2 : 0,
      jitter: confidence < JITTER_THRESHOLD ? (1 - confidence) * 4 : 0,
    };
  }

  /**
   * Apply degradation to a single entity's primitives. Reuses cached
   * ConstantProperty / PolylineDashMaterialProperty instances via setValue()
   * so we don't churn the GC on every TimeMachine tick.
   */
  private applyToEntity(id: string, entity: Entity, state: DegradationState): void {
    let cache = this.propCache.get(id);
    if (!cache) {
      cache = {};
      this.propCache.set(id, cache);
    }

    const julian = JulianDate.fromDate(new Date());
    const blurScale = 1 - Math.min(0.6, state.blur * 0.3);
    const blurPixelMul = 1 - Math.min(0.5, state.blur * 0.25);
    const [jitterX, jitterY] = computeJitterOffset(id, cache, state.jitter);

    if (entity.billboard) {
      applyBillboard(entity.billboard, state, cache, julian, blurScale, jitterX, jitterY);
    }
    if (entity.point) {
      applyPoint(entity.point, state, cache, julian, blurPixelMul);
    }
    if (entity.label) {
      applyLabel(entity.label, state, cache);
    }
    if (entity.polyline) {
      applyPolyline(entity.polyline, state, cache, julian);
    }
  }
}

function setOrCreate<T>(
  cache: EntityPropertyCache,
  key: keyof EntityPropertyCache,
  value: T,
): ConstantProperty {
  const existing = cache[key] as ConstantProperty | undefined;
  if (existing) {
    existing.setValue(value);
    return existing;
  }
  const created = new ConstantProperty(value);
  (cache as Record<string, unknown>)[key as string] = created;
  return created;
}

function applyBillboard(
  billboard: NonNullable<Entity['billboard']>,
  state: DegradationState,
  cache: EntityPropertyCache,
  julian: JulianDate,
  blurScale: number,
  jitterX: number,
  jitterY: number,
): void {
  const current = billboard.color?.getValue(julian) as Color | undefined;
  if (current) {
    billboard.color = setOrCreate(cache, 'billboardColor', current.withAlpha(state.opacity));
  }
  billboard.scale = setOrCreate(cache, 'billboardScale', blurScale);
  billboard.pixelOffset = setOrCreate(cache, 'billboardPixelOffset', new Cartesian2(jitterX, jitterY));
}

function applyPoint(
  point: NonNullable<Entity['point']>,
  state: DegradationState,
  cache: EntityPropertyCache,
  julian: JulianDate,
  blurPixelMul: number,
): void {
  const current = point.color?.getValue(julian) as Color | undefined;
  if (current) {
    point.color = setOrCreate(cache, 'pointColor', current.withAlpha(state.opacity));
  }
  const currentSize = point.pixelSize?.getValue(julian) as number | undefined;
  if (typeof currentSize === 'number' && currentSize > 0) {
    point.pixelSize = setOrCreate(cache, 'pointPixelSize', currentSize * blurPixelMul);
  }
}

function applyLabel(
  label: NonNullable<Entity['label']>,
  state: DegradationState,
  cache: EntityPropertyCache,
): void {
  label.show = setOrCreate(cache, 'labelShow', state.confidence > LABEL_THRESHOLD);
}

function applyPolyline(
  polyline: NonNullable<Entity['polyline']>,
  state: DegradationState,
  cache: EntityPropertyCache,
  julian: JulianDate,
): void {
  const baseColor = (polyline.material as { color?: { getValue?: (t: JulianDate) => Color } } | undefined)
    ?.color?.getValue?.(julian) ?? Color.WHITE;
  const faded = baseColor.withAlpha(state.opacity);
  const colorProp = setOrCreate(cache, 'polylineMaterialColor', faded);

  if (state.isDashed) {
    cache.polylineDashMaterial ??= new PolylineDashMaterialProperty({
      color: colorProp,
      dashLength: 12,
    });
    polyline.material = cache.polylineDashMaterial;
    cache.polylineWasDashed = true;
  } else if (cache.polylineWasDashed) {
    cache.polylineSolidMaterial ??= new ColorMaterialProperty(colorProp);
    polyline.material = cache.polylineSolidMaterial;
    cache.polylineWasDashed = false;
  }
}

/**
 * Stable per-entity jitter offset from a deterministic hash of the id.
 * Returns [x, y] in pixels, scaled by the current jitter intensity.
 */
function computeJitterOffset(
  id: string,
  cache: EntityPropertyCache,
  intensity: number,
): [number, number] {
  if (intensity <= 0) return [0, 0];
  if (cache.jitterSeed === undefined) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = Math.trunc((hash << 5) - hash + (id.codePointAt(i) ?? 0));
    }
    cache.jitterSeed = hash;
  }
  const seed = cache.jitterSeed;
  const angle = ((seed & 0xFF_FF) / 0xFF_FF) * Math.PI * 2;
  const magnitude = Math.min(1, intensity) * JITTER_MAX_PX;
  return [Math.cos(angle) * magnitude, Math.sin(angle) * magnitude];
}
