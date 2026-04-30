import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeDegradationState,
  computeJitterOffset,
  CONFIDENCE_FLOOR,
  DASH_THRESHOLD,
  BLUR_THRESHOLD,
  JITTER_THRESHOLD,
  LAYER_DECAY_TAU_MS,
} from '../src/components/gods-eye/degradation-math.ts';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// ─────────────────────────────────────────────────────────────────────────
// Past / present entities — full confidence, no degradation
// ─────────────────────────────────────────────────────────────────────────

test('past entity (timeFromNow ≤ 0) returns full confidence with no degradation flags', () => {
  const s = computeDegradationState(0, DAY_MS);
  assert.equal(s.confidence, 1);
  assert.equal(s.opacity, 1);
  assert.equal(s.isDashed, false);
  assert.equal(s.blur, 0);
  assert.equal(s.jitter, 0);
});

test('negative timeFromNow (clock skew) treated as past', () => {
  const s = computeDegradationState(-HOUR_MS, DAY_MS);
  assert.equal(s.confidence, 1);
  assert.equal(s.isDashed, false);
});

test('zero or negative tau returns full confidence (defensive)', () => {
  assert.equal(computeDegradationState(HOUR_MS, 0).confidence, 1);
  assert.equal(computeDegradationState(HOUR_MS, -1).confidence, 1);
});

// ─────────────────────────────────────────────────────────────────────────
// Confidence floor — even at extreme horizons, entities stay pickable
// ─────────────────────────────────────────────────────────────────────────

test('confidence is floored at CONFIDENCE_FLOOR for very-far-future entities', () => {
  const s = computeDegradationState(100 * DAY_MS, DAY_MS); // way past 3τ
  assert.equal(s.confidence, CONFIDENCE_FLOOR);
  assert.equal(s.opacity, CONFIDENCE_FLOOR);
});

// ─────────────────────────────────────────────────────────────────────────
// Threshold transitions — dashed / blur / jitter / labelHidden
// ─────────────────────────────────────────────────────────────────────────

test('dashed state activates when confidence drops below DASH_THRESHOLD (0.5)', () => {
  // exp(-t/τ) = 0.49  ⇒  t = -τ·ln(0.49) ≈ 0.713τ
  const tau = DAY_MS;
  const justBelow = -Math.log(0.49) * tau;
  const justAbove = -Math.log(0.51) * tau;
  assert.equal(computeDegradationState(justBelow, tau).isDashed, true);
  assert.equal(computeDegradationState(justAbove, tau).isDashed, false);
});

test('blur is non-zero when confidence drops below BLUR_THRESHOLD (0.3)', () => {
  const tau = DAY_MS;
  const sBlurred = computeDegradationState(-Math.log(0.25) * tau, tau);
  const sCrisp = computeDegradationState(-Math.log(0.4) * tau, tau);
  assert.ok(sBlurred.blur > 0, `expected blur > 0 at confidence ~0.25, got ${sBlurred.blur}`);
  assert.equal(sCrisp.blur, 0, `expected blur = 0 at confidence ~0.4, got ${sCrisp.blur}`);
});

test('jitter is non-zero when confidence drops below JITTER_THRESHOLD (0.2)', () => {
  const tau = DAY_MS;
  const sJittered = computeDegradationState(-Math.log(0.15) * tau, tau);
  const sStable = computeDegradationState(-Math.log(0.25) * tau, tau);
  assert.ok(sJittered.jitter > 0, `expected jitter > 0 at confidence ~0.15, got ${sJittered.jitter}`);
  assert.equal(sStable.jitter, 0, `expected jitter = 0 at confidence ~0.25, got ${sStable.jitter}`);
});

test('thresholds form a strict ordering (DASH > BLUR ≥ LABEL > JITTER > FLOOR)', () => {
  assert.ok(DASH_THRESHOLD > BLUR_THRESHOLD);
  assert.ok(BLUR_THRESHOLD >= JITTER_THRESHOLD);
  assert.ok(JITTER_THRESHOLD > CONFIDENCE_FLOOR);
});

// ─────────────────────────────────────────────────────────────────────────
// Per-layer τ — verifies wiring of the layer decay constants
// ─────────────────────────────────────────────────────────────────────────

test('LAYER_DECAY_TAU_MS includes all forecast-able layers', () => {
  for (const layer of ['conflicts', 'airstrikes', 'earthquakes', 'gdacs', 'cyclones', 'fires']) {
    assert.ok(LAYER_DECAY_TAU_MS[layer] > 0, `missing or non-positive τ for ${layer}`);
  }
});

test('earthquake τ (10 days) is much longer than gdacs τ (~16 hours) — slower decay for seismic', () => {
  const eqTau = LAYER_DECAY_TAU_MS.earthquakes;
  const gdacsTau = LAYER_DECAY_TAU_MS.gdacs;
  assert.ok(eqTau && gdacsTau);
  assert.ok(eqTau > gdacsTau * 10, `expected earthquake τ ≫ gdacs τ`);
});

// ─────────────────────────────────────────────────────────────────────────
// Jitter offset — deterministic by id, scales with intensity
// ─────────────────────────────────────────────────────────────────────────

test('jitter offset is [0, 0] at zero intensity', () => {
  const [x, y] = computeJitterOffset('any-id', 0);
  assert.equal(x, 0);
  assert.equal(y, 0);
});

test('jitter offset is deterministic for the same id', () => {
  const a = computeJitterOffset('eq-12345', 1);
  const b = computeJitterOffset('eq-12345', 1);
  assert.deepEqual(a, b);
});

test('jitter offset differs across distinct ids (no constant collapse)', () => {
  const a = computeJitterOffset('eq-aaa', 1);
  const b = computeJitterOffset('eq-bbb', 1);
  assert.notDeepEqual(a, b);
});

test('jitter offset magnitude scales linearly with intensity (clamped at 1)', () => {
  const [x1, y1] = computeJitterOffset('eq-1', 0.5);
  const [x2, y2] = computeJitterOffset('eq-1', 1);
  const r1 = Math.hypot(x1, y1);
  const r2 = Math.hypot(x2, y2);
  assert.ok(Math.abs(r2 / r1 - 2) < 0.01, `expected 2× magnitude, got ratio ${(r2 / r1).toFixed(3)}`);
});

// ─────────────────────────────────────────────────────────────────────────
// Per-layer integration spot checks — what would the panel actually render?
// ─────────────────────────────────────────────────────────────────────────

test('cyclone at +36h forecast (vs τ=1.67d) is below DASH but above BLUR — should render dashed but crisp', () => {
  const tau = LAYER_DECAY_TAU_MS.cyclones!;
  // confidence at +36h = exp(-1.5/1.67) ≈ 0.41 → dashed (< 0.5) but not blurred (> 0.3)
  const s = computeDegradationState(1.5 * DAY_MS, tau);
  assert.ok(s.confidence > BLUR_THRESHOLD, `still crisp (got ${s.confidence})`);
  assert.ok(s.confidence < DASH_THRESHOLD, `should be dashed (got ${s.confidence})`);
  assert.equal(s.isDashed, true);
  assert.equal(s.blur, 0);
});

test('cyclone at +120h forecast (Day-5) drops below blur and jitter — full ghost rendering', () => {
  const tau = LAYER_DECAY_TAU_MS.cyclones!;
  const s = computeDegradationState(5 * DAY_MS, tau);
  assert.ok(s.confidence < JITTER_THRESHOLD, `expected confidence < ${JITTER_THRESHOLD}, got ${s.confidence}`);
  assert.equal(s.isDashed, true);
  assert.ok(s.blur > 0);
  assert.ok(s.jitter > 0);
});
