/**
 * Situation Awareness Engine — OODA Loop Orchestrator
 *
 * Core loop: Observe → Verify → Correlate → Forecast → Personalize → Recommend → Reassess
 *
 * This is the top-level API that data-loader.ts calls. It:
 * 1. Ingests raw CorrelationSignals and UnifiedAlerts
 * 2. Clusters them into Situations via the correlator
 * 3. Projects scenarios via the forecaster
 * 4. Generates user-specific action cards via the personalizer
 * 5. Periodically reassesses all active situations
 * 6. Notifies subscribers of changes
 */

import type { CorrelationSignalCore } from './analysis-core';
import type { EvidencePack } from './evidence-pack';
import type { UnifiedAlert } from './unified-alerts';
import type {
  Situation,
  SituationEngineConfig,
} from './situation-types';
import { DEFAULT_ENGINE_CONFIG } from './situation-types';
import {
  correlateSignalToSituation,
  reassessSituations,
} from './situation-correlator';
import { projectScenarios } from './situation-forecaster';
import { personalizeSituation } from './situation-personalizer';

// ── Subscriber Pattern ───────────────────────────────────────────────────────

type SituationListener = (situations: Situation[]) => void;

// ── Engine ────────────────────────────────────────────────────────────────────

export class SituationEngine {
  private situations: Situation[] = [];
  private listeners: Set<SituationListener> = new Set();
  private config: SituationEngineConfig;
  private reassessTimer: ReturnType<typeof setInterval> | null = null;
  private _signalBuffer: CorrelationSignalCore[] = [];

  constructor(config: SituationEngineConfig = DEFAULT_ENGINE_CONFIG) {
    this.config = config;
    this.restore();
  }

  // ── 1. OBSERVE — Ingest raw signals ──────────────────────────────────────

  /**
   * Ingest correlation signals. This is the primary entry point called by
   * data-loader after analyzeCorrelations() completes.
   */
  observeSignals(signals: CorrelationSignalCore[]): void {
    if (signals.length === 0) return;

    this._signalBuffer.push(...signals);
    this.processBuffer();
  }

  /**
   * Ingest unified alerts (from NWS, GDACS, etc.) as supplementary signals.
   * These provide additional domain color but don't directly create situations
   * unless they're high severity.
   */
  observeAlerts(alerts: UnifiedAlert[]): void {
    for (const alert of alerts) {
      if (alert.severity !== 'critical' && alert.severity !== 'high') continue;

      // Convert high-severity unified alerts into pseudo-signals
      const pseudoSignal: CorrelationSignalCore = {
        id: `ua-${alert.id}`,
        type: alert.source === 'nws' ? 'keyword_spike'
          : alert.source === 'gdacs' ? 'geo_convergence'
          : alert.source === 'cyber' ? 'keyword_spike'
          : 'convergence',
        title: alert.title,
        description: alert.body,
        confidence: alert.severity === 'critical' ? 0.85 : 0.6,
        timestamp: new Date(alert.timestamp),
        data: {
          explanation: alert.title,
          placeIds: alert.location ? [alert.location.label ?? ''] : [],
          placeSummary: alert.location?.label ?? undefined,
        },
      };

      this._signalBuffer.push(pseudoSignal);
    }

    if (this._signalBuffer.length > 0) {
      this.processBuffer();
    }
  }

  // ── 2. VERIFY — Cross-check with evidence ───────────────────────────────

  private verify(situation: Situation): void {
    // Aggregate evidence from all contributing signals
    const evidenceSources = situation.signals.filter(s => s.confidence > 0.5);
    const sourceCount = evidenceSources.length;
    const avgConfidence = sourceCount > 0
      ? evidenceSources.reduce((s, e) => s + e.confidence, 0) / sourceCount
      : 0;

    // Simple evidence aggregation — in the future this could call
    // buildSignalEvidencePack for each signal and merge
    if (sourceCount >= 2) {
      situation.evidence = {
        claim: situation.title,
        verdict: avgConfidence > 0.7 && sourceCount >= 3 ? 'actionable'
          : avgConfidence > 0.5 ? 'corroborated'
          : 'reported',
        freshness: (Date.now() - situation.lastUpdated) < 6 * 3600000 ? 'fresh'
          : (Date.now() - situation.lastUpdated) < 24 * 3600000 ? 'recent'
          : 'stale',
        supportingSources: [],
        conflictingSources: [],
        corroborationCount: sourceCount,
        trustedSourceCount: evidenceSources.filter(s => s.confidence > 0.7).length,
        sourceDiversity: new Set(evidenceSources.map(s => s.type)).size,
        confidenceReason: `${sourceCount} signal${sourceCount === 1 ? '' : 's'} from ${situation.domainDiversity} domain${situation.domainDiversity === 1 ? '' : 's'}`,
        actionThreshold: avgConfidence > 0.7 ? 'act' : avgConfidence > 0.4 ? 'verify' : 'monitor',
        firstSeen: new Date(situation.firstSeen),
        lastUpdated: new Date(situation.lastUpdated),
      } as EvidencePack;
    }
  }

  // ── 3–6. CORRELATE → FORECAST → PERSONALIZE → RECOMMEND ─────────────────

  private processBuffer(): void {
    if (this._signalBuffer.length === 0) return;

    const signals = this._signalBuffer.splice(0);
    let changed = false;

    for (const signal of signals) {
      // CORRELATE: cluster into situation
      const result = correlateSignalToSituation(signal, this.situations, this.config);
      changed = true;

      // Get the affected situation
      const situation = this.situations.find(s => s.id === result.situationId);
      if (!situation) continue;

      // VERIFY: cross-check evidence
      this.verify(situation);

      // FORECAST: project scenarios
      situation.scenarios = projectScenarios(situation);

      // PERSONALIZE + RECOMMEND: generate action cards
      situation.actions = personalizeSituation(situation);
    }

    if (changed) {
      this.persist();
      this.notify();
    }
  }

  // ── 7. REASSESS — Periodic lifecycle update ──────────────────────────────

  private reassess(): void {
    const before = this.situations.length;
    this.situations = reassessSituations(this.situations, this.config);

    // Re-forecast active situations (scenarios may shift as time passes)
    for (const sit of this.situations) {
      if (sit.phase === 'active' || sit.phase === 'developing') {
        sit.scenarios = projectScenarios(sit);
        sit.actions = personalizeSituation(sit);
      }
    }

    if (this.situations.length !== before) {
      this.persist();
    }
    this.notify();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (this.reassessTimer) return;
    this.reassessTimer = setInterval(() => this.reassess(), this.config.reassessIntervalMs);
  }

  stop(): void {
    if (this.reassessTimer) {
      clearInterval(this.reassessTimer);
      this.reassessTimer = null;
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** Get all situations sorted by phase priority then confidence */
  getSituations(): Situation[] {
    const phaseOrder: Record<string, number> = {
      active: 0,
      developing: 1,
      emerging: 2,
      'de-escalating': 3,
      resolved: 4,
    };
    return [...this.situations].sort((a, b) => {
      const phaseDiff = (phaseOrder[a.phase] ?? 9) - (phaseOrder[b.phase] ?? 9);
      if (phaseDiff !== 0) return phaseDiff;
      return b.confidence - a.confidence;
    });
  }

  /** Get only actionable situations (developing or active) */
  getActionableSituations(): Situation[] {
    return this.getSituations().filter(
      s => s.phase === 'active' || s.phase === 'developing',
    );
  }

  /** Get count of active + developing situations */
  getActiveCount(): number {
    return this.situations.filter(
      s => s.phase === 'active' || s.phase === 'developing',
    ).length;
  }

  /** Subscribe to situation changes */
  subscribe(listener: SituationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private persist(): void {
    try {
      // Only persist non-resolved situations, max 20
      const toStore = this.situations
        .filter(s => s.phase !== 'resolved')
        .slice(0, 20);
      localStorage.setItem('wm-situations-v1', JSON.stringify(toStore));
    } catch { /* quota or private mode */ }
  }

  private restore(): void {
    try {
      const raw = localStorage.getItem('wm-situations-v1');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Rehydrate — filter out stale situations (>24h old)
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        this.situations = parsed.filter(
          (s: Situation) => s.lastUpdated > cutoff && s.phase !== 'resolved',
        );
      }
    } catch { /* corrupt data */ }
  }

  private notify(): void {
    const snapshot = this.getSituations();
    for (const listener of this.listeners) {
      try { listener(snapshot); } catch { /* listener error */ }
    }

    // Also dispatch a DOM event for other components
    document.dispatchEvent(new CustomEvent('wm:situations-updated', {
      detail: {
        total: snapshot.length,
        active: snapshot.filter(s => s.phase === 'active').length,
        developing: snapshot.filter(s => s.phase === 'developing').length,
      },
    }));
  }

  /** Reset all situations (for testing or user action) */
  reset(): void {
    this.situations = [];
    this.persist();
    this.notify();
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const situationEngine = new SituationEngine();
