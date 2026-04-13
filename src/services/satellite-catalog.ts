/**
 * Satellite Catalog — TLE data from CelesTrak + intelligence annotations
 *
 * Fetches active satellite TLEs from CelesTrak GP API (free, no key).
 * Annotates notable objects (ISS, spy sats, GPS, Starlink, military).
 * Refresh interval: 4 hours. Circuit breaker with persistent cache.
 */

import { createCircuitBreaker } from '@/utils';

export interface SatelliteTLE {
  noradId: number;
  name: string;
  line1: string;
  line2: string;
  classification: SatelliteClassification;
  annotation: SatelliteAnnotation | null;
}

export type SatelliteClassification =
  | 'recon'          // NRO, CSO, Ofek, SBIRS, DSP — reconnaissance/ISR
  | 'station'        // ISS, Tiangong — space stations
  | 'military'       // Kosmos, Yaogan, LIANA — military (non-recon)
  | 'constellation'  // GPS, Starlink, Iridium — rendered dimly
  | 'normal';        // Everything else — small gray dot

export interface SatelliteAnnotation {
  category: string;
  label: string;
  color: [number, number, number];  // RGB
  priority: number;                 // Lower = more important, rendered on top
}

const CELESTRAK_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json';

interface CelesTrakGP {
  OBJECT_NAME: string;
  NORAD_CAT_ID: number;
  TLE_LINE1: string;
  TLE_LINE2: string;
}

const breaker = createCircuitBreaker<SatelliteTLE[]>({
  name: 'SatelliteCatalog',
  cacheTtlMs: 4 * 60 * 60 * 1000,
  persistCache: true,
});

export async function fetchSatelliteCatalog(): Promise<SatelliteTLE[]> {
  return breaker.execute(async () => {
    const res = await fetch(CELESTRAK_URL, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`CelesTrak HTTP ${String(res.status)}`);

    const data = await res.json() as CelesTrakGP[];

    return data.map(sat => ({
      noradId: sat.NORAD_CAT_ID,
      name: sat.OBJECT_NAME,
      line1: sat.TLE_LINE1,
      line2: sat.TLE_LINE2,
      classification: classifySatellite(sat.OBJECT_NAME, sat.NORAD_CAT_ID),
      annotation: annotateSatellite(sat.OBJECT_NAME, sat.NORAD_CAT_ID),
    }));
  }, []);
}

/** Get only recon + station + military satellites for low-zoom rendering */
export function filterNotable(catalog: SatelliteTLE[]): SatelliteTLE[] {
  return catalog.filter(s => s.classification === 'recon' || s.classification === 'station' || s.classification === 'military');
}

// ── Intelligence Annotation Tables ──────────────────────────────

const NOTABLE_IDS: Record<number, SatelliteAnnotation> = {
  25_544: { category: 'station', label: 'ISS (ZARYA)', color: [50, 205, 50], priority: 1 },
  48_274: { category: 'station', label: 'Tiangong', color: [50, 205, 50], priority: 2 },
};

interface PatternRule {
  pattern: RegExp;
  classification: SatelliteClassification;
  annotation: Omit<SatelliteAnnotation, 'label'>;
}

const NAME_PATTERNS: PatternRule[] = [
  { pattern: /^NROL-/i, classification: 'recon', annotation: { category: 'SIGINT/IMINT', color: [239, 50, 50], priority: 5 } },
  { pattern: /^USA \d+/i, classification: 'military', annotation: { category: 'US Military', color: [239, 68, 68], priority: 5 } },
  { pattern: /^SBIRS/i, classification: 'recon', annotation: { category: 'Missile Warning', color: [239, 50, 50], priority: 3 } },
  { pattern: /^DSP/i, classification: 'recon', annotation: { category: 'Missile Warning', color: [239, 50, 50], priority: 3 } },
  { pattern: /^CSO-\d/i, classification: 'recon', annotation: { category: 'French Recon', color: [239, 50, 50], priority: 4 } },
  { pattern: /^PLEIADES[\s-]NEO/i, classification: 'recon', annotation: { category: 'French ISR', color: [239, 50, 50], priority: 4 } },
  { pattern: /^OFEK/i, classification: 'recon', annotation: { category: 'Israeli Recon', color: [239, 50, 50], priority: 4 } },
  { pattern: /^NAVSTAR/i, classification: 'constellation', annotation: { category: 'GPS', color: [96, 165, 250], priority: 10 } },
  { pattern: /^STARLINK/i, classification: 'constellation', annotation: { category: 'Starlink', color: [120, 120, 120], priority: 50 } },
  { pattern: /^IRIDIUM/i, classification: 'constellation', annotation: { category: 'Iridium', color: [120, 120, 120], priority: 50 } },
  { pattern: /^COSMOS|^KOSMOS/i, classification: 'military', annotation: { category: 'Russian Military', color: [249, 115, 22], priority: 8 } },
  { pattern: /^LIANA/i, classification: 'military', annotation: { category: 'Russian SIGINT', color: [249, 115, 22], priority: 6 } },
  { pattern: /^YAOGAN/i, classification: 'military', annotation: { category: 'Chinese Military', color: [249, 115, 22], priority: 8 } },
  { pattern: /^SHIJIAN/i, classification: 'military', annotation: { category: 'Chinese Military', color: [249, 115, 22], priority: 8 } },
  { pattern: /^GOES-/i, classification: 'normal', annotation: { category: 'Weather (US)', color: [34, 211, 238], priority: 20 } },
  { pattern: /^JPSS/i, classification: 'normal', annotation: { category: 'Weather (US)', color: [34, 211, 238], priority: 20 } },
  { pattern: /^METEOSAT/i, classification: 'normal', annotation: { category: 'Weather (EU)', color: [34, 211, 238], priority: 20 } },
];

function classifySatellite(name: string, noradId: number): SatelliteClassification {
  if (NOTABLE_IDS[noradId]) return 'station';
  for (const rule of NAME_PATTERNS) {
    if (rule.pattern.test(name)) return rule.classification;
  }
  return 'normal';
}

function annotateSatellite(name: string, noradId: number): SatelliteAnnotation | null {
  const byId = NOTABLE_IDS[noradId];
  if (byId) return byId;
  for (const rule of NAME_PATTERNS) {
    if (rule.pattern.test(name)) {
      return { ...rule.annotation, label: name };
    }
  }
  return null;
}

export function isReconOrMilitary(classification: SatelliteClassification): boolean {
  return classification === 'recon' || classification === 'military';
}

export function getClassificationLabel(classification: SatelliteClassification): string {
  const labels: Record<SatelliteClassification, string> = {
    recon: 'RECON',
    station: 'STATION',
    military: 'MILITARY',
    constellation: 'CONSTELLATION',
    normal: 'CIVIL',
  };
  return labels[classification];
}
