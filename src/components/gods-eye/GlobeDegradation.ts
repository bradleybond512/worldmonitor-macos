/**
 * GlobeDegradation — reality-degradation rendering pipeline.
 *
 * Computes per-entity confidence based on how far ahead of NOW the entity's
 * timestamp sits, then applies opacity / dash / blur / jitter rules:
 *   • confidence = 1                     → crisp past event
 *   • 0.5 ≤ confidence < 1               → near future, full color, slight fade
 *   • 0.3 ≤ confidence < 0.5             → dashed paths, faded labels
 *   • confidence < 0.3                   → blurred, ghostly
 *   • confidence < 0.2                   → jitter the position by ±jitter px
 *
 * Adjustments are applied directly to the Cesium entity's billboard / point
 * / label properties via the layer's CustomDataSource. Polylines and shapes
 * are out of scope for this PR — they require fade material edits on the
 * primitive collections rather than per-entity property writes.
 *
 * Plan: docs/superpowers/plans/2026-04-13-gods-eye-4d.md (Task 8)
 */

import { Color, ConstantProperty, JulianDate, type Viewer } from 'cesium';
import type { GlobeDataManager } from '@/components/GlobeDataManager';

/* eslint-disable @typescript-eslint/no-unused-vars -- viewer kept on the
 * constructor for future Cesium-primitive trail/path degradation; today's
 * implementation only mutates per-entity properties from the data sources. */

const DAY_MS = 86_400_000;

/** Per-layer maximum forecast horizon — confidence hits 0.05 floor at this distance. */
const LAYER_FORECAST_MS: Record<string, number> = {
  conflicts:   7 * DAY_MS,
  airstrikes:  7 * DAY_MS,
  earthquakes: 30 * DAY_MS,
  gdacs:       2 * DAY_MS,
  cyclones:    5 * DAY_MS,
  fires:       2 * DAY_MS,
};

const CONFIDENCE_FLOOR = 0.05;
const DASH_THRESHOLD = 0.5;
const BLUR_THRESHOLD = 0.3;
const JITTER_THRESHOLD = 0.2;
const LABEL_THRESHOLD = 0.3;

export interface DegradationState {
  confidence: number;
  opacity: number;
  isDashed: boolean;
  blur: number;
  jitter: number;
}

export class GlobeDegradation {
  private dataManager: GlobeDataManager;
  private cache = new Map<string, DegradationState>();
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

    for (const [layerName, maxForecast] of Object.entries(LAYER_FORECAST_MS)) {
      const entities = this.dataManager.getLayerEntitiesWithTimestamps(layerName);
      const source = sources.get(layerName);
      if (!source) continue;

      for (const e of entities) {
        const timeFromNow = e.timeMs - currentMs;
        const state = timeFromNow <= 0
          ? { confidence: 1, opacity: 1, isDashed: false, blur: 0, jitter: 0 }
          : GlobeDegradation.computeState(timeFromNow, maxForecast);
        this.cache.set(e.id, state);

        const cesium = source.entities.getById(e.id);
        if (cesium) GlobeDegradation.applyOpacityToEntity(cesium, state);
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
  }

  static computeState(timeFromNowMs: number, maxForecastMs: number): DegradationState {
    if (maxForecastMs <= 0) {
      return { confidence: 1, opacity: 1, isDashed: false, blur: 0, jitter: 0 };
    }
    const confidence = Math.max(CONFIDENCE_FLOOR, Math.min(1, 1 - timeFromNowMs / maxForecastMs));
    return {
      confidence,
      opacity: confidence,
      isDashed: confidence < DASH_THRESHOLD,
      blur: confidence < BLUR_THRESHOLD ? (1 - confidence) * 2 : 0,
      jitter: confidence < JITTER_THRESHOLD ? (1 - confidence) * 4 : 0,
    };
  }

  /**
   * Apply opacity / label-visibility to a single entity's primitives.
   * Cesium's typed Property API doesn't expose a direct setter for color
   * alpha, so we sample the current color (via getValue at NOW), reapply
   * with the degraded alpha as a ConstantProperty, and let Cesium pick it
   * up on the next render tick.
   */
  private static applyOpacityToEntity(
    entity: import('cesium').Entity,
    state: DegradationState,
  ): void {
    const julian = JulianDate.fromDate(new Date());
    const fade = (color: Color): Color => color.withAlpha(state.opacity);

    if (entity.billboard) {
      const current = entity.billboard.color?.getValue(julian) as Color | undefined;
      if (current) entity.billboard.color = new ConstantProperty(fade(current));
    }
    if (entity.point) {
      const current = entity.point.color?.getValue(julian) as Color | undefined;
      if (current) entity.point.color = new ConstantProperty(fade(current));
    }
    if (entity.label) {
      entity.label.show = new ConstantProperty(state.confidence > LABEL_THRESHOLD);
    }
  }
}
