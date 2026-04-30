import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeAftershockForecast,
  computeCycloneCone,
  type TrackPoint,
} from '../src/services/forecast-engine.ts';

// ─────────────────────────────────────────────────────────────────────────
// Aftershock — Omori-Utsu temporal decay & Gutenberg-Richter scaling
// ─────────────────────────────────────────────────────────────────────────

test('aftershock: 30-day window probability for M6.5 mainshock at 50 km radius / M4 threshold is between 0.5 and 0.95', () => {
  const f = computeAftershockForecast('eq-6.5', 0, 0, 6.5);
  const ring = f.rings.find(r => r.radiusKm === 50 && r.magnitudeThreshold === 4);
  assert.ok(ring, 'expected M4 ring at 50 km');
  assert.ok(ring.probability > 0.5, `expected high probability for M6.5 → M4 aftershock at 50km, got ${ring.probability}`);
  assert.ok(ring.probability <= 0.95, 'probability ceiling is 0.95');
});

test('aftershock: probability monotonically increases with mainshock magnitude (M5 < M6 < M7) at fixed ring', () => {
  const m5 = computeAftershockForecast('m5', 0, 0, 5).rings.find(r => r.radiusKm === 50 && r.magnitudeThreshold === 4);
  const m6 = computeAftershockForecast('m6', 0, 0, 6).rings.find(r => r.radiusKm === 50 && r.magnitudeThreshold === 4);
  const m7 = computeAftershockForecast('m7', 0, 0, 7).rings.find(r => r.radiusKm === 50 && r.magnitudeThreshold === 4);
  assert.ok(m5 && m6 && m7);
  assert.ok(m5.probability < m6.probability, 'M5 < M6');
  assert.ok(m6.probability < m7.probability, 'M6 < M7');
});

test('aftershock: probability monotonically decreases with magnitude threshold (M4 > M5 > M6) at fixed ring radius', () => {
  const f = computeAftershockForecast('eq', 0, 0, 6.5);
  const m4 = f.rings.find(r => r.radiusKm === 50 && r.magnitudeThreshold === 4);
  const m5 = f.rings.find(r => r.radiusKm === 50 && r.magnitudeThreshold === 5);
  const m6 = f.rings.find(r => r.radiusKm === 50 && r.magnitudeThreshold === 6);
  assert.ok(m4 && m5 && m6);
  assert.ok(m4.probability > m5.probability, 'M4 prob > M5 prob');
  assert.ok(m5.probability > m6.probability, 'M5 prob > M6 prob');
});

test('aftershock: probability scales with area — larger radius rings carry more probability', () => {
  const f = computeAftershockForecast('eq', 0, 0, 6.5);
  const r25 = f.rings.find(r => r.radiusKm === 25 && r.magnitudeThreshold === 4);
  const r50 = f.rings.find(r => r.radiusKm === 50 && r.magnitudeThreshold === 4);
  const r100 = f.rings.find(r => r.radiusKm === 100 && r.magnitudeThreshold === 4);
  assert.ok(r25 && r50 && r100);
  assert.ok(r25.probability < r50.probability, '25km < 50km');
  assert.ok(r50.probability < r100.probability, '50km < 100km');
});

test('aftershock: M3 mainshock with M4 threshold returns floored probability (no aftershocks expected above mainshock)', () => {
  const f = computeAftershockForecast('eq-small', 0, 0, 3);
  const ring = f.rings.find(r => r.radiusKm === 50 && r.magnitudeThreshold === 4);
  assert.ok(ring);
  assert.equal(ring.probability, 0.01, 'floored at 1% when threshold ≥ mainshock');
});

test('aftershock: produces 9 rings (3 radii × 3 magnitude thresholds)', () => {
  const f = computeAftershockForecast('eq', 12.34, 56.78, 6);
  assert.equal(f.rings.length, 9);
  assert.equal(f.epicenterLat, 12.34);
  assert.equal(f.epicenterLon, 56.78);
  assert.equal(f.mainshockMagnitude, 6);
});

// ─────────────────────────────────────────────────────────────────────────
// Cyclone — NHC-style cone of uncertainty (σ_ct=35·t^0.6, σ_at=55·t^0.6)
// ─────────────────────────────────────────────────────────────────────────

const T0 = 1_700_000_000_000;

function makeTrack(headingDeg: number, speedKmh: number, lat = 25, lon = -75): TrackPoint[] {
  const headRad = (headingDeg * Math.PI) / 180;
  const dLat = -Math.cos(headRad) * speedKmh / 111;
  const lonScale = Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  const dLon = -Math.sin(headRad) * speedKmh / 111 / lonScale;
  return [
    { lat: lat + dLat, lon: lon + dLon, timeMs: T0 - 3600_000 },
    { lat, lon, timeMs: T0 },
  ];
}

test('cyclone cone: returns null for empty track', () => {
  const cone = computeCycloneCone('tc-empty', []);
  assert.equal(cone, null);
});

test('cyclone cone: 5 forecast hops produce 6 probable-path points (current + 5 daily)', () => {
  const cone = computeCycloneCone('tc-1', makeTrack(0, 22));
  assert.ok(cone);
  assert.equal(cone.type, 'cyclone');
  assert.equal(cone.probablePath.length, 6, 'current + +1d/+2d/+3d/+4d/+5d');
});

test('cyclone cone: confidence drops over 5-day forecast', () => {
  const cone = computeCycloneCone('tc-2', makeTrack(0, 22));
  assert.ok(cone);
  const c1 = cone.probablePath[1]?.confidence ?? 0;
  const c5 = cone.probablePath[5]?.confidence ?? 0;
  assert.ok(c1 > c5, 'day-1 confidence > day-5 confidence');
});

test('cyclone cone: forecast point at +24h lies within ~25 km of (current + speed×24h along heading)', () => {
  const cone = computeCycloneCone('tc-3', makeTrack(0, 22));
  assert.ok(cone);
  const p1 = cone.probablePath[1];
  assert.ok(p1);
  // Heading 0 (north), speed 22 km/h × 24h = 528 km ≈ 4.76° lat
  const expectedLatDelta = (22 * 24) / 111;
  const actualDelta = p1.lat - 25;
  assert.ok(
    Math.abs(actualDelta - expectedLatDelta) < 0.5,
    `expected ~${expectedLatDelta.toFixed(2)}° lat delta, got ${actualDelta.toFixed(2)}°`,
  );
});

test('cyclone cone: σ_ct grows with t^0.6 — day-5 cone width > day-1 cone width', () => {
  const cone = computeCycloneCone('tc-4', makeTrack(0, 22));
  assert.ok(cone);
  // conePolygon = [start, right_d1, right_d2, ... right_d5, right_tip, left_d5_reversed, ... left_d1_reversed]
  // We can compare lateral spread at different days by measuring distance from probablePath axis.
  const probable = cone.probablePath;
  const polygon = cone.conePolygon;
  // right envelope is polygon[1..5] (indices 1-5 are d1-d5)
  const right1 = polygon[1];
  const right5 = polygon[5];
  const path1 = probable[1];
  const path5 = probable[5];
  assert.ok(right1 && right5 && path1 && path5);
  const spread1 = Math.hypot(right1.lat - path1.lat, right1.lon - path1.lon);
  const spread5 = Math.hypot(right5.lat - path5.lat, right5.lon - path5.lon);
  assert.ok(spread5 > spread1, 'day-5 spread > day-1 spread');
  // Specifically, σ_ct at day 5 / day 1 = 5^0.6 ≈ 2.626
  const ratio = spread5 / spread1;
  assert.ok(ratio > 2.0 && ratio < 3.5, `expected σ ratio ~2.626, got ${ratio.toFixed(2)}`);
});

test('cyclone cone: cone polygon includes start point + right envelope + reversed left envelope', () => {
  const cone = computeCycloneCone('tc-5', makeTrack(45, 22));
  assert.ok(cone);
  // 1 start + 5 right (d1-d5) + 1 along-track tip + 5 left (reversed) = 12 vertices
  assert.equal(cone.conePolygon.length, 12);
});

test('cyclone cone: single-point track falls back to deterministic bearing — still produces a cone', () => {
  const cone = computeCycloneCone('tc-fallback', [{ lat: 25, lon: -75, timeMs: T0 }]);
  assert.ok(cone);
  assert.equal(cone.probablePath.length, 6);
});

test('cyclone cone: entityId is preserved on the result', () => {
  const cone = computeCycloneCone('storm-melissa-2026', makeTrack(180, 30));
  assert.ok(cone);
  assert.equal(cone.entityId, 'storm-melissa-2026');
});
