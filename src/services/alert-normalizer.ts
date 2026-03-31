/**
 * Alert Normalizer
 *
 * Converts every alert source type in World Monitor into a UnifiedAlert.
 * Each normalizer is a pure function: source type in, UnifiedAlert out.
 */

import type { UnifiedAlert, AlertSeverity } from './unified-alerts';
import type { BreakingAlert } from './breaking-news-alerts';
import type { CorrelationSignal } from './correlation';
import type { NWSAlert } from './nws-alerts';
import type { TsunamiAlert } from './tsunami-alerts';
import type { GDACSEvent } from './gdacs';
import type { NearbyHazard } from './proximity-alerts';

// ── Breaking News ────────────────────────────────────────────────────────

export function normalizeBreakingAlert(alert: BreakingAlert): UnifiedAlert {
  return {
    id: `bn-${alert.id}`,
    source: 'breaking-news',
    severity: alert.threatLevel,
    title: alert.headline,
    body: `${alert.origin.replace(/_/g, ' ')} · ${alert.source}`,
    timestamp: alert.timestamp.getTime(),
    location: alert.lat != null && alert.lon != null
      ? { lat: alert.lat, lon: alert.lon, label: alert.placeSummary }
      : undefined,
    relevanceScore: 0,
    acknowledged: false,
    pinned: false,
    link: alert.link,
    evidence: alert.evidence,
    raw: alert,
  };
}

// ── Correlation Signals ──────────────────────────────────────────────────

function signalSeverity(confidence: number): AlertSeverity {
  if (confidence > 0.8) return 'high';
  if (confidence > 0.65) return 'medium';
  if (confidence > 0.4) return 'low';
  return 'info';
}

export function normalizeCorrelationSignal(signal: CorrelationSignal): UnifiedAlert {
  return {
    id: `cs-${signal.id}`,
    source: 'correlation',
    severity: signalSeverity(signal.confidence),
    title: signal.title,
    body: signal.description,
    timestamp: signal.timestamp.getTime(),
    location: undefined, // signals are typically not geo-located
    relevanceScore: 0,
    acknowledged: false,
    pinned: false,
    evidence: signal.evidence,
    raw: signal,
  };
}

// ── NWS Weather Alerts ───────────────────────────────────────────────────

const NWS_SEVERITY_MAP: Record<NWSAlert['severity'], AlertSeverity> = {
  Extreme: 'critical',
  Severe: 'high',
  Moderate: 'medium',
  Minor: 'low',
  Unknown: 'info',
};

export function normalizeNWSAlert(alert: NWSAlert): UnifiedAlert {
  return {
    id: `nws-${alert.id}`,
    source: 'nws',
    severity: NWS_SEVERITY_MAP[alert.severity] ?? 'info',
    title: alert.event,
    body: alert.headline,
    timestamp: new Date(alert.onset).getTime(),
    location: alert.centroid
      ? { lat: alert.centroid[1], lon: alert.centroid[0], label: alert.areaDesc }
      : undefined,
    relevanceScore: 0,
    acknowledged: false,
    pinned: false,
    raw: alert,
  };
}

// ── GDACS Disaster Alerts ────────────────────────────────────────────────

const GDACS_SEVERITY_MAP: Record<GDACSEvent['alertLevel'], AlertSeverity> = {
  Red: 'critical',
  Orange: 'high',
  Green: 'low',
};

const GDACS_TYPE_LABEL: Record<string, string> = {
  EQ: 'Earthquake',
  FL: 'Flood',
  TC: 'Tropical Cyclone',
  VO: 'Volcano',
  WF: 'Wildfire',
  DR: 'Drought',
};

export function normalizeGDACSEvent(event: GDACSEvent): UnifiedAlert {
  const typeLabel = GDACS_TYPE_LABEL[event.eventType] ?? event.eventType;
  return {
    id: `gdacs-${event.id}`,
    source: 'gdacs',
    severity: GDACS_SEVERITY_MAP[event.alertLevel] ?? 'info',
    title: `${typeLabel}: ${event.name}`,
    body: `${event.description} · ${event.country}${event.severity ? ` · ${event.severity}` : ''}`,
    timestamp: event.fromDate.getTime(),
    location: event.coordinates
      ? { lat: event.coordinates[1], lon: event.coordinates[0], label: event.country }
      : undefined,
    relevanceScore: 0,
    acknowledged: false,
    pinned: false,
    link: event.url,
    raw: event,
  };
}

// ── Tsunami Alerts ───────────────────────────────────────────────────────

const TSUNAMI_SEVERITY_MAP: Record<TsunamiAlert['severity'], AlertSeverity> = {
  warning: 'critical',
  watch: 'high',
  advisory: 'medium',
  information: 'low',
  'threat-canceled': 'info',
};

export function normalizeTsunamiAlert(alert: TsunamiAlert): UnifiedAlert {
  return {
    id: `tsu-${alert.id}`,
    source: 'tsunami',
    severity: TSUNAMI_SEVERITY_MAP[alert.severity] ?? 'info',
    title: alert.title,
    body: `${alert.region} · ${alert.description.slice(0, 200)}`,
    timestamp: alert.pubDate.getTime(),
    location: undefined, // tsunami alerts cover wide regions, no single point
    relevanceScore: 0,
    acknowledged: false,
    pinned: false,
    link: alert.url,
    raw: alert,
  };
}

// ── Proximity Hazards ────────────────────────────────────────────────────

const HAZARD_TYPE_LABEL: Record<NearbyHazard['type'], string> = {
  wildfire: 'Wildfire',
  hazmat: 'Hazmat',
  'oil-spill': 'Oil Spill',
  'air-quality': 'Air Quality',
};

export function normalizeNearbyHazard(hazard: NearbyHazard): UnifiedAlert {
  const typeLabel = HAZARD_TYPE_LABEL[hazard.type] ?? hazard.type;
  return {
    id: `haz-${hazard.id}`,
    source: 'hazard',
    severity: hazard.severity,
    title: `${typeLabel}: ${hazard.title}`,
    body: `${hazard.location} · ${hazard.distanceMiles.toFixed(1)} mi${hazard.evacuationOrder ? ' · EVACUATION ORDER' : ''}`,
    timestamp: hazard.reportedAt.getTime(),
    distanceKm: hazard.distanceMiles * 1.60934,
    relevanceScore: 0,
    acknowledged: false,
    pinned: false,
    link: hazard.url,
    raw: hazard,
  };
}
