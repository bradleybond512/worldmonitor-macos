/**
 * Unified Alert Types
 *
 * Common interface for all alert sources in World Monitor.
 * Every alert — breaking news, NWS weather, GDACS disaster, tsunami,
 * hazard proximity, OREF siren, correlation signal — normalizes to this shape.
 */

import type { EvidencePack } from './evidence-pack';
import { alertDB } from './alert-store';

export type AlertSource =
  | 'breaking-news'
  | 'nws'
  | 'gdacs'
  | 'tsunami'
  | 'volcano'
  | 'oref'
  | 'hazard'
  | 'correlation'
  | 'cyber';

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface UnifiedAlert {
  id: string;
  source: AlertSource;
  severity: AlertSeverity;
  title: string;
  body: string;
  timestamp: number;
  location?: { lat: number; lon: number; label?: string };
  distanceKm?: number;
  relevanceScore: number;
  acknowledged: boolean;
  pinned: boolean;
  link?: string;
  evidence?: EvidencePack;
  raw?: unknown;
}

const STORAGE_KEY = 'wm-unified-alerts-v1';
const MAX_ALERTS = 500;
const PRUNE_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

/**
 * In-memory store for unified alerts.
 * Persisted to localStorage for cross-session survival.
 */
class UnifiedAlertStore {
  private alerts = new Map<string, UnifiedAlert>();
  private listeners = new Set<() => void>();

  constructor() {
    this.loadFromStorage();
  }

  /** Add or update alerts. Deduplicates by id. */
  ingest(incoming: UnifiedAlert[]): void {
    let changed = false;
    for (const alert of incoming) {
      const existing = this.alerts.get(alert.id);
      if (existing) {
        // Update relevanceScore and timestamp if newer, preserve ack/pin state
        if (alert.timestamp >= existing.timestamp) {
          this.alerts.set(alert.id, {
            ...alert,
            acknowledged: existing.acknowledged,
            pinned: existing.pinned,
          });
          changed = true;
        }
      } else {
        this.alerts.set(alert.id, alert);
        changed = true;
      }
    }
    if (changed) {
      this.prune();
      this.persist();
      this.notify();

      // Fire-and-forget: persist to IndexedDB for 30-day retention
      alertDB.putBatch(incoming).catch(() => { /* silent — IDB persistence is best-effort */ });
    }
  }

  getAll(): UnifiedAlert[] {
    return [...this.alerts.values()];
  }

  getUnacknowledgedCount(): number {
    let count = 0;
    for (const a of this.alerts.values()) {
      if (!a.acknowledged) count++;
    }
    return count;
  }

  acknowledge(id: string): void {
    const alert = this.alerts.get(id);
    if (alert && !alert.acknowledged) {
      alert.acknowledged = true;
      this.persist();
      this.notify();
    }
  }

  acknowledgeAll(): void {
    let changed = false;
    for (const alert of this.alerts.values()) {
      if (!alert.acknowledged) {
        alert.acknowledged = true;
        changed = true;
      }
    }
    if (changed) {
      this.persist();
      this.notify();
    }
  }

  togglePin(id: string): void {
    const alert = this.alerts.get(id);
    if (alert) {
      alert.pinned = !alert.pinned;
      this.persist();
      this.notify();
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try { fn(); } catch { /* noop */ }
    }
  }

  private prune(): void {
    const now = Date.now();
    // Remove old unpinned alerts
    for (const [id, alert] of this.alerts) {
      if (!alert.pinned && now - alert.timestamp > PRUNE_AGE_MS) {
        this.alerts.delete(id);
      }
    }
    // Cap size — remove oldest acknowledged first, then oldest unacknowledged
    if (this.alerts.size > MAX_ALERTS) {
      const sorted = [...this.alerts.values()].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
        return a.timestamp - b.timestamp;
      });
      const toDrop = sorted.slice(0, sorted.length - MAX_ALERTS);
      for (const alert of toDrop) {
        this.alerts.delete(alert.id);
      }
    }
  }

  private persist(): void {
    try {
      const entries = [...this.alerts.values()];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch { /* storage full — silently drop */ }
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const entries = JSON.parse(raw) as UnifiedAlert[];
      const now = Date.now();
      for (const entry of entries) {
        if (entry.pinned || now - entry.timestamp <= PRUNE_AGE_MS) {
          this.alerts.set(entry.id, entry);
        }
      }
    } catch { /* corrupted — start fresh */ }
  }
}

export const unifiedAlertStore = new UnifiedAlertStore();
