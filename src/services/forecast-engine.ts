/**
 * Forecast engine — aggregates prediction shapes from existing data sources.
 *
 * Used by GlobePredictions (Task 10, Tier 2 hover/click cones) and
 * GlobeBranching (Task 11, click-only scenario forks). Pure functions; no
 * Cesium imports here so they're trivially unit-testable.
 *
 * The aftershock and conflict-branch math is simplified by design — the
 * spec calls for production-grade ETAS / NHC track ensemble in a follow-up.
 * The current models are good enough to render plausible Tier 2 overlays
 * and to plug into the existing EMA forecast service.
 *
 * Plan: docs/superpowers/plans/2026-04-13-gods-eye-4d.md (Task 9)
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const EARTH_RADIUS_KM = 6371;

export interface ForecastPoint {
  lat: number;
  lon: number;
  timeMs: number;
  confidence: number;
}

export interface ForecastCone {
  entityId: string;
  type: 'cyclone' | 'flight' | 'fire' | 'vessel';
  probablePath: ForecastPoint[];
  /** Outer boundary as a closed polygon (caller closes the loop). */
  conePolygon: { lat: number; lon: number }[];
}

export interface AftershockRing {
  radiusKm: number;
  probability: number;
  magnitudeThreshold: number;
}

export interface AftershockForecast {
  entityId: string;
  epicenterLat: number;
  epicenterLon: number;
  mainshockMagnitude: number;
  rings: AftershockRing[];
}

export interface ScenarioBranch {
  label: string;
  probability: number;
  outcome: 'escalation' | 'stalemate' | 'deescalation';
  path: ForecastPoint[];
  conditions: string;
}

export interface BranchingForecast {
  entityId: string;
  type: 'conflict' | 'cyclone';
  branches: ScenarioBranch[];
}

/**
 * Simplified Reasenberg-Jones / ETAS aftershock probability over a 30-day
 * window. Three radius rings (25/50/100 km) × three magnitude thresholds
 * (M4 / M5 / M6). Probability decays with distance and rises with mainshock
 * magnitude. Floor 1%, ceiling 95%.
 */
export function computeAftershockForecast(
  entityId: string,
  lat: number,
  lon: number,
  magnitude: number,
): AftershockForecast {
  const rings: AftershockRing[] = [];
  const baseP = Math.min(0.95, Math.pow(10, magnitude - 5) * 0.1);

  for (const radiusKm of [25, 50, 100]) {
    const distanceFactor = 1 / (1 + radiusKm / 50);
    for (const magThreshold of [4, 5, 6]) {
      const magFactor = Math.pow(10, -(magThreshold - magnitude + 1));
      const prob = Math.min(0.95, Math.max(0.01, baseP * distanceFactor * magFactor));
      rings.push({ radiusKm, probability: prob, magnitudeThreshold: magThreshold });
    }
  }

  return {
    entityId,
    epicenterLat: lat,
    epicenterLon: lon,
    mainshockMagnitude: magnitude,
    rings,
  };
}

/**
 * Conflict escalation branches from an EMA trend signal.
 *  emaTrend ∈ [-1, 1]   negative = de-escalating, positive = escalating.
 * Returns three branches whose probabilities sum to 1 (within rounding).
 */
export function computeConflictBranches(
  entityId: string,
  lat: number,
  lon: number,
  emaTrend: number,
): BranchingForecast {
  const escalateP = Math.max(0.05, Math.min(0.8, 0.3 + emaTrend * 0.4));
  const deescalateP = Math.max(0.05, Math.min(0.8, 0.3 - emaTrend * 0.4));
  const stalemateP = Math.max(0.05, 1 - escalateP - deescalateP);

  const makePathWithBearing = (bearing: number): ForecastPoint[] => {
    const points: ForecastPoint[] = [];
    const bearingStep = 0.005; // ≈0.5 km per day-step
    for (let i = 0; i <= 7; i++) {
      const dayMs = i * DAY_MS;
      const confidence = Math.max(0.1, 1 - i / 7);
      points.push({
        lat: lat + Math.cos(bearing) * bearingStep * i,
        lon: lon + Math.sin(bearing) * bearingStep * i,
        timeMs: Date.now() + dayMs,
        confidence,
      });
    }
    return points;
  };

  return {
    entityId,
    type: 'conflict',
    branches: [
      {
        label: 'De-escalation',
        probability: deescalateP,
        outcome: 'deescalation',
        path: makePathWithBearing(Math.PI * 0.75),
        conditions: 'Ceasefire negotiations progress, external pressure increases',
      },
      {
        label: 'Stalemate',
        probability: stalemateP,
        outcome: 'stalemate',
        path: makePathWithBearing(0),
        conditions: 'Current tempo maintained, no significant territorial changes',
      },
      {
        label: 'Escalation',
        probability: escalateP,
        outcome: 'escalation',
        path: makePathWithBearing(-Math.PI * 0.5),
        conditions: 'New fronts open, external actors intervene, weapons escalation',
      },
    ],
  };
}

/**
 * Extrapolate a flight along its current heading using a great-circle
 * approximation. Returns 9 forecast points (every 15 min for 2 h) plus a
 * cone polygon that widens linearly with time.
 */
export function computeFlightCone(
  entityId: string,
  lat: number,
  lon: number,
  headingDeg: number,
  speedKnots: number,
): ForecastCone {
  const headingRad = (headingDeg * Math.PI) / 180;
  const speedKmH = speedKnots * 1.852;
  const points: ForecastPoint[] = [];

  for (let hours = 0; hours <= 2; hours += 0.25) {
    const distKm = speedKmH * hours;
    const dLat = (distKm / EARTH_RADIUS_KM) * Math.cos(headingRad) * (180 / Math.PI);
    const dLon = (distKm / EARTH_RADIUS_KM) * Math.sin(headingRad) * (180 / Math.PI) / Math.cos((lat * Math.PI) / 180);
    const confidence = Math.max(0.1, 1 - hours / 2);
    points.push({
      lat: lat + dLat,
      lon: lon + dLon,
      timeMs: Date.now() + hours * HOUR_MS,
      confidence,
    });
  }

  const spreadRate = 0.002; // ° per hour, lateral
  const conePolygon: { lat: number; lon: number }[] = [];
  for (const p of points) {
    const hours = (p.timeMs - Date.now()) / HOUR_MS;
    const spread = spreadRate * hours;
    const perpRad = headingRad + Math.PI / 2;
    conePolygon.push({
      lat: p.lat + Math.cos(perpRad) * spread,
      lon: p.lon + Math.sin(perpRad) * spread,
    });
  }
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (!p) continue;
    const hours = (p.timeMs - Date.now()) / HOUR_MS;
    const spread = spreadRate * hours;
    const perpRad = headingRad - Math.PI / 2;
    conePolygon.push({
      lat: p.lat + Math.cos(perpRad) * spread,
      lon: p.lon + Math.sin(perpRad) * spread,
    });
  }

  return { entityId, type: 'flight', probablePath: points, conePolygon };
}
