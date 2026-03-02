/**
 * App Mode Manager — Peace / Finance / War
 *
 * Three monitoring modes that shift panel focus and visual accent.
 * War Mode can auto-trigger when correlation signals reach a threat threshold.
 * Persists selection to localStorage so it survives page reload.
 */

import type { CorrelationSignal } from '@/services/correlation';

export type AppMode = 'peace' | 'finance' | 'war';

const MODE_STORAGE_KEY = 'wm-app-mode';

/** Number of war-class signals (above confidence threshold) that trigger auto War Mode */
const WAR_AUTO_TRIGGER_SCORE = 3;

/** Correlation signal types that count toward the war threat score */
const WAR_SIGNAL_TYPES = new Set<string>([
  'hotspot_escalation',
  'military_surge',
  'geo_convergence',
]);

const WAR_SIGNAL_MIN_CONFIDENCE = 0.6;

let currentMode: AppMode = 'peace';

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/** Return the current active mode. */
export function getMode(): AppMode {
  return currentMode;
}

/**
 * Switch to a new mode.
 * @param mode  Target mode.
 * @param auto  If true, the switch was triggered automatically (not by user).
 */
export function setMode(mode: AppMode, auto = false): void {
  if (mode === currentMode) return;
  const prev = currentMode;
  currentMode = mode;
  localStorage.setItem(MODE_STORAGE_KEY, mode);
  document.dispatchEvent(
    new CustomEvent<ModeChangedDetail>('wm:mode-changed', {
      detail: { mode, prev, auto },
    }),
  );
  if (auto && mode === 'war') {
    _notifyWarModeActivated();
  }
}

/**
 * Read the persisted mode from localStorage on startup.
 * Should be called once during app init before rendering the sidebar.
 */
export function initMode(): AppMode {
  try {
    const saved = localStorage.getItem(MODE_STORAGE_KEY) as AppMode | null;
    if (saved === 'peace' || saved === 'finance' || saved === 'war') {
      currentMode = saved;
    }
  } catch {
    // localStorage unavailable — stay at default
  }
  return currentMode;
}

/**
 * Evaluate a batch of correlation signals and, if enough war-class signals
 * are detected, automatically switch to War Mode from Peace Mode.
 *
 * Dispatches `wm:war-score` with `{ score, threshold }` regardless of outcome
 * so the UI can update a threat indicator.
 */
export function evaluateWarThreat(signals: CorrelationSignal[]): void {
  const warSignals = signals.filter(
    s => WAR_SIGNAL_TYPES.has(s.type) && (s.confidence ?? 0) >= WAR_SIGNAL_MIN_CONFIDENCE,
  );
  const score = warSignals.length;

  document.dispatchEvent(
    new CustomEvent<WarScoreDetail>('wm:war-score', {
      detail: { score, threshold: WAR_AUTO_TRIGGER_SCORE },
    }),
  );

  // Only auto-escalate from Peace → War; never override an explicit user choice
  if (score >= WAR_AUTO_TRIGGER_SCORE && currentMode === 'peace') {
    setMode('war', true);
  }
}

/**
 * Copy a pre-formatted family safety alert to the clipboard.
 * The user can then paste it into SMS / messaging apps.
 */
export function alertFamily(): void {
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const msg = [
    '⚠️  WORLD MONITOR — SAFETY ALERT',
    `Time: ${dateStr}`,
    '',
    'World Monitor has detected elevated conflict or crisis signals.',
    'Please stay informed, follow local emergency guidance,',
    'and check in with each other.',
    '',
    'Stay safe,',
    '— World Monitor',
  ].join('\n');

  navigator.clipboard.writeText(msg).catch(() => {
    // Clipboard API unavailable — silently ignore
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

function _notifyWarModeActivated(): void {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('⚠️ World Monitor — War Mode Activated', {
        body: 'Elevated conflict signals detected. Monitoring has switched to War Mode.',
        tag: 'wm-war-mode',
        requireInteraction: false,
      });
    }
  } catch {
    // Notifications unavailable in this environment
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Event detail types (exported for consumers)
// ──────────────────────────────────────────────────────────────────────────────

export interface ModeChangedDetail {
  mode: AppMode;
  prev: AppMode;
  auto: boolean;
}

export interface WarScoreDetail {
  score: number;
  threshold: number;
}
