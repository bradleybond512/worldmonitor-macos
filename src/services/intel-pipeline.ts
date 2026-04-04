/**
 * Intel Pipeline Wiring
 *
 * Connects data-loader fetch results to the new Palantir/Dragos-inspired
 * services. Each function is called from data-loader after a successful
 * fetch, keeping integration logic out of the massive data-loader file.
 *
 * All functions are fire-and-forget — errors are caught internally
 * so they never disrupt the primary data pipeline.
 */

import { bulkIngest, addIoc } from '@/services/ioc-manager';
import { updateVesselPosition } from '@/services/dark-vessel';
import { checkEvent, getGeofences } from '@/services/custom-geofence';
import { ingestSigintEvent } from '@/services/sigint-convergence';
import { ingestRegionEvent, rollHourlyBaseline } from '@/services/pattern-of-life';
import { ingestAttackPhase, type KillChainPhase } from '@/services/kill-chain';
import { ingestConvergenceEvent } from '@/services/threat-convergence';
import { registerUnit } from '@/services/orbat';
import { addNode, updateNodeStatus, ingestTopoAlert } from '@/services/network-topology';
import { ingestOtAlert, registerOtAsset } from '@/services/ics-ot-monitor';
import { createAar, addTimelineEntry } from '@/services/after-action-review';
import { getMode } from '@/services/mode-manager';
import type { CyberThreat, MilitaryFlight, MilitaryVessel, SocialUnrestEvent } from '@/types';
import type { Earthquake } from '@/generated/client/worldmonitor/seismology/v1/service_client';
import type { GpsJamHex } from '@/services/gps-interference';
import type { AirstrikeEvent } from '@/services/airstrikes';

// ── IOC Manager ─────────────────────────────────────────────────────────────

const CYBER_TO_IOC_TYPE: Record<string, 'ip' | 'domain' | 'url'> = {
  ip: 'ip',
  domain: 'domain',
  url: 'url',
};

export function ingestCyberToIoc(threats: CyberThreat[]): void {
  try {
    const entries = threats.slice(0, 500).map(t => ({
      type: CYBER_TO_IOC_TYPE[t.indicatorType] ?? ('ip' as const),
      value: t.indicator,
      source: t.source,
      confidence: t.severity === 'critical' ? 90 : t.severity === 'high' ? 75 : t.severity === 'medium' ? 50 : 25,
      tags: [...t.tags, t.type, t.malwareFamily].filter(Boolean) as string[],
      description: `${t.type} from ${t.source}${t.malwareFamily ? ` (${t.malwareFamily})` : ''}`,
    }));
    bulkIngest(entries);
  } catch { /* non-critical */ }
}

export function ingestCisaKevToIoc(threats: CyberThreat[]): void {
  try {
    for (const t of threats.slice(0, 200)) {
      if (t.source === 'cisa_kev') {
        addIoc('cve', t.indicator, 'CISA KEV', 95, ['cisa', 'kev', 'exploited'], `Known exploited vulnerability: ${t.indicator}`, 'amber');
      }
    }
  } catch { /* non-critical */ }
}

// ── Dark Vessel ─────────────────────────────────────────────────────────────

export function ingestAisToDarkVessel(disruptions: Array<{
  id: string; name: string; lat?: number; lon?: number;
  darkShips?: number; region?: string;
}>): void {
  try {
    for (const d of disruptions) {
      if (d.darkShips && d.darkShips > 0 && d.lat != null && d.lon != null) {
        // Each disruption zone with dark ships creates synthetic vessel entries
        for (let i = 0; i < Math.min(d.darkShips, 5); i++) {
          updateVesselPosition(
            `dark-${d.id}-${i}`,
            `Unknown (${d.name} zone)`,
            'unknown',
            d.lat + (Math.random() - 0.5) * 0.5,
            d.lon + (Math.random() - 0.5) * 0.5,
            Date.now() - 12 * 60 * 60 * 1000, // Mark as 12h ago to trigger dark detection
          );
        }
      }
    }
  } catch { /* non-critical */ }
}

export function ingestMilVesselsToDarkVessel(vessels: MilitaryVessel[]): void {
  try {
    for (const v of vessels) {
      updateVesselPosition(v.mmsi, v.name, v.operatorCountry, v.lat, v.lon);
    }
  } catch { /* non-critical */ }
}

// ── Geofence ────────────────────────────────────────────────────────────────

export function checkGeofenceEarthquakes(quakes: Earthquake[]): void {
  try {
    if (getGeofences().filter(f => f.enabled).length === 0) return;
    for (const eq of quakes) {
      if (!eq.location) continue;
      checkEvent(eq.location.latitude, eq.location.longitude, 'earthquake', `M${eq.magnitude} ${eq.place}`);
    }
  } catch { /* non-critical */ }
}

export function checkGeofenceProtests(events: SocialUnrestEvent[]): void {
  try {
    if (getGeofences().filter(f => f.enabled).length === 0) return;
    for (const e of events) {
      checkEvent(e.lat, e.lon, 'protest', e.title || 'Protest event');
    }
  } catch { /* non-critical */ }
}

export function checkGeofenceCyber(threats: CyberThreat[]): void {
  try {
    if (getGeofences().filter(f => f.enabled).length === 0) return;
    for (const t of threats.slice(0, 100)) {
      if (t.lat && t.lon) {
        checkEvent(t.lat, t.lon, 'cyber', `${t.type}: ${t.indicator}`);
      }
    }
  } catch { /* non-critical */ }
}

export function checkGeofenceAirstrikes(events: AirstrikeEvent[]): void {
  try {
    if (getGeofences().filter(f => f.enabled).length === 0) return;
    for (const e of events) {
      checkEvent(e.lat, e.lon, 'conflict', `${e.eventType}: ${e.location}`);
    }
  } catch { /* non-critical */ }
}

export function checkGeofenceMilitary(flights: MilitaryFlight[]): void {
  try {
    if (getGeofences().filter(f => f.enabled).length === 0) return;
    for (const f of flights.slice(0, 50)) {
      checkEvent(f.lat, f.lon, 'military', `${f.operator} ${f.aircraftType}: ${f.callsign}`);
    }
  } catch { /* non-critical */ }
}

// ── SIGINT Convergence ──────────────────────────────────────────────────────

export function ingestGpsToSigint(hexes: GpsJamHex[]): void {
  try {
    for (const h of hexes.filter(h => h.level === 'high')) {
      ingestSigintEvent(
        'gps_jamming', h.lat, h.lon,
        h.pct >= 50 ? 'critical' : 'high',
        `GNSS jamming: ${h.pct}% signals affected`,
        'GPSJam',
      );
    }
  } catch { /* non-critical */ }
}

export function ingestCableToSigint(cables: Record<string, { status: string; score: number }>): void {
  try {
    // Cable health data doesn't have lat/lon directly, use known cable landing points
    const CABLE_COORDS: Record<string, [number, number]> = {
      'aae-1': [30.0, 32.3],      // Suez area
      'seamewe-6': [1.3, 103.8],   // Singapore
      'peace': [25.0, 55.3],       // Dubai
      '2africa': [-6.2, 39.2],     // Dar es Salaam
      'equiano': [6.5, 3.4],       // Lagos
    };
    for (const [id, cable] of Object.entries(cables)) {
      if (cable.status === 'fault' || cable.status === 'degraded') {
        const coords = CABLE_COORDS[id.toLowerCase()];
        if (coords) {
          ingestSigintEvent(
            'cable_outage', coords[0], coords[1],
            cable.status === 'fault' ? 'critical' : 'medium',
            `Submarine cable ${id}: ${cable.status} (score: ${cable.score})`,
            'CableHealth',
          );
        }
      }
    }
  } catch { /* non-critical */ }
}

export function ingestOutagesToSigint(outages: Array<{ lat?: number; lon?: number; country?: string; score?: number }>): void {
  try {
    for (const o of outages.slice(0, 20)) {
      if (o.lat != null && o.lon != null && (o.score ?? 0) >= 5) {
        ingestSigintEvent(
          'bgp_anomaly', o.lat, o.lon,
          (o.score ?? 0) >= 8 ? 'high' : 'medium',
          `Internet outage: ${o.country ?? 'unknown'} (score: ${o.score ?? 0})`,
          'NetBlocks',
        );
      }
    }
  } catch { /* non-critical */ }
}

// ── Pattern of Life ─────────────────────────────────────────────────────────

function classifyRegionForPoL(lat: number, _lon: number): string {
  // Simple region bucketing
  if (lat > 55) return 'northern-europe';
  if (lat > 35) return 'central-europe';
  if (lat > 20) return 'middle-east-north-africa';
  if (lat > 0) return 'sub-saharan-africa';
  return 'southern-hemisphere';
}

export function ingestEarthquakesToPoL(quakes: Earthquake[]): void {
  try {
    for (const eq of quakes) {
      if (!eq.location) continue;
      const region = classifyRegionForPoL(eq.location.latitude, eq.location.longitude);
      ingestRegionEvent(region, region);
    }
  } catch { /* non-critical */ }
}

export function ingestProtestsToPoL(events: SocialUnrestEvent[]): void {
  try {
    for (const e of events) {
      const region = classifyRegionForPoL(e.lat, e.lon);
      ingestRegionEvent(region, region);
    }
  } catch { /* non-critical */ }
}

export function ingestCyberToPoL(threats: CyberThreat[]): void {
  try {
    for (const t of threats.slice(0, 100)) {
      if (t.lat && t.lon) {
        const region = classifyRegionForPoL(t.lat, t.lon);
        ingestRegionEvent(region, region);
      }
    }
  } catch { /* non-critical */ }
}

export function rollPoLBaseline(): void {
  try {
    rollHourlyBaseline();
  } catch { /* non-critical */ }
}

// ── Kill Chain ──────────────────────────────────────────────────────────────

const THREAT_TYPE_TO_PHASE: Record<string, KillChainPhase> = {
  c2_server: 'C2',
  malware_host: 'Execution',
  phishing: 'Initial Access',
  malicious_url: 'Initial Access',
  malicious_ip_range: 'Reconnaissance',
  exploited_vulnerability: 'Initial Access',
};

export function ingestCyberToKillChain(threats: CyberThreat[]): void {
  try {
    for (const t of threats.slice(0, 100)) {
      const phase = THREAT_TYPE_TO_PHASE[t.type];
      if (!phase) continue;
      ingestAttackPhase(
        t.source,
        phase,
        `${t.type}${t.malwareFamily ? ` (${t.malwareFamily})` : ''}`,
        `${t.indicatorType}: ${t.indicator} from ${t.source}`,
        t.severity === 'critical' ? 90 : t.severity === 'high' ? 70 : t.severity === 'medium' ? 50 : 30,
        [t.indicator],
      );
    }
  } catch { /* non-critical */ }
}

// ── Threat Convergence (multi-domain) ───────────────────────────────────────

export function ingestCyberToConvergence(threats: CyberThreat[]): void {
  try {
    for (const t of threats.slice(0, 50)) {
      if (t.lat && t.lon) {
        ingestConvergenceEvent(t.lat, t.lon, 'cyber');
      }
    }
  } catch { /* non-critical */ }
}

export function ingestOutagesToConvergence(outages: Array<{ lat?: number; lon?: number; country?: string }>): void {
  try {
    for (const o of outages) {
      if (o.lat != null && o.lon != null) {
        ingestConvergenceEvent(o.lat, o.lon, 'outage');
      }
    }
  } catch { /* non-critical */ }
}

export function ingestAirstrikesToConvergence(events: AirstrikeEvent[]): void {
  try {
    for (const e of events) {
      ingestConvergenceEvent(e.lat, e.lon, 'conflict');
    }
  } catch { /* non-critical */ }
}

// ── ORBAT ───────────────────────────────────────────────────────────────────

export function ingestMilFlightsToOrbat(flights: MilitaryFlight[]): void {
  try {
    for (const f of flights.slice(0, 100)) {
      registerUnit({
        id: `flight-${f.hexCode}`,
        name: f.callsign,
        designation: f.aircraftModel ?? f.aircraftType,
        echelon: 'team',
        unitType: 'aviation',
        parentId: null,
        country: f.operatorCountry,
        lat: f.lat,
        lon: f.lon,
        strength: 'full',
        status: 'deployed',
        notes: `${f.operator} ${f.aircraftType}`,
      });
    }
  } catch { /* non-critical */ }
}

export function ingestMilVesselsToOrbat(vessels: MilitaryVessel[]): void {
  try {
    for (const v of vessels.slice(0, 100)) {
      registerUnit({
        id: `vessel-${v.mmsi}`,
        name: v.name,
        designation: v.hullNumber ?? v.vesselType,
        echelon: v.vesselType === 'carrier' || v.vesselType === 'amphibious' ? 'brigade' : 'company',
        unitType: 'naval',
        parentId: null,
        country: v.operatorCountry,
        lat: v.lat,
        lon: v.lon,
        strength: 'full',
        status: 'deployed',
        notes: `${v.operator} ${v.vesselType}`,
      });
    }
  } catch { /* non-critical */ }
}

// ── Network Topology ────────────────────────────────────────────────────────

export function ingestOutagesToTopology(outages: Array<{
  id?: string; country?: string; lat?: number; lon?: number; score?: number;
}>): void {
  try {
    for (const o of outages.slice(0, 30)) {
      if (o.lat != null && o.lon != null) {
        const nodeId = `isp-${o.country ?? 'unknown'}-${o.id ?? Math.random().toString(36).slice(2, 8)}`;
        addNode(nodeId, `ISP ${o.country ?? 'Unknown'}`, 'router', {
          location: o.country ?? 'unknown',
        });
        const score = o.score ?? 0;
        updateNodeStatus(nodeId, score >= 8 ? 'down' : score >= 4 ? 'degraded' : 'healthy');
        if (score >= 6) {
          ingestTopoAlert('node_down', score >= 8 ? 'high' : 'medium', `Internet outage in ${o.country ?? 'unknown'} (score: ${score})`, nodeId);
        }
      }
    }
  } catch { /* non-critical */ }
}

export function ingestCableToTopology(cables: Record<string, { status: string; score: number }>): void {
  try {
    for (const [id, cable] of Object.entries(cables)) {
      addNode(`cable-${id}`, `Cable: ${id}`, 'switch', { location: 'submarine' });
      updateNodeStatus(`cable-${id}`, cable.status === 'fault' ? 'down' : cable.status === 'degraded' ? 'degraded' : 'healthy');
      if (cable.status === 'fault') {
        ingestTopoAlert('node_down', 'critical', `Submarine cable ${id} fault (score: ${cable.score})`, `cable-${id}`);
      }
    }
  } catch { /* non-critical */ }
}

// ── ICS/OT (from CISA advisories) ──────────────────────────────────────────

export function ingestCisaToIcsOt(threats: CyberThreat[]): void {
  try {
    const cisaThreats = threats.filter(t => t.source === 'cisa_kev');
    for (const t of cisaThreats.slice(0, 50)) {
      // Register generic ICS asset for tracking
      registerOtAsset(
        `cisa-${t.id}`,
        'CISA Advisory Target',
        'scada_server',
        'Government',
        'TCP/IP',
        t.country ?? 'US',
        t.lat || 38.9,
        t.lon || -77.0,
      );
      ingestOtAlert(
        `cisa-${t.id}`,
        'policy_violation',
        t.severity === 'critical' ? 'critical' : 'high',
        `Known exploited vulnerability: ${t.indicator}`,
        'Initial Access',
      );
    }
  } catch { /* non-critical */ }
}

// ── AAR (mode-down auto-creation) ───────────────────────────────────────────

let lastElevatedMode: string | null = null;
let modeElevatedAt = 0;

export function trackModeForAar(mode: string): void {
  try {
    if (mode !== 'peace' && mode !== lastElevatedMode) {
      lastElevatedMode = mode;
      modeElevatedAt = Date.now();
    } else if (mode === 'peace' && lastElevatedMode && modeElevatedAt > 0) {
      // Mode went from elevated back to peace — create AAR
      const durationMin = Math.round((Date.now() - modeElevatedAt) / 60000);
      if (durationMin >= 5) {
        const aarId = createAar(
          `${lastElevatedMode.charAt(0).toUpperCase() + lastElevatedMode.slice(1)} Mode Incident`,
          modeElevatedAt,
          lastElevatedMode,
          `App was in ${lastElevatedMode} mode for ${durationMin} minutes before returning to peace.`,
        );
        addTimelineEntry(aarId, modeElevatedAt, `Entered ${lastElevatedMode} mode`, 'mode-manager');
        addTimelineEntry(aarId, Date.now(), 'Returned to peace mode', 'mode-manager');
      }
      lastElevatedMode = null;
      modeElevatedAt = 0;
    }
  } catch { /* non-critical */ }
}

export function initModeTracking(): void {
  try {
    const currentMode = getMode();
    if (currentMode !== 'peace') {
      lastElevatedMode = currentMode;
      modeElevatedAt = Date.now();
    }
    window.addEventListener('wm:mode-changed', (e: Event) => {
      const detail = (e as CustomEvent).detail as { mode?: string } | undefined;
      if (detail?.mode) trackModeForAar(detail.mode);
    });
  } catch { /* non-critical */ }
}
