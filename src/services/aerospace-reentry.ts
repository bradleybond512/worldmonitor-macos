// Satellite and space debris reentry predictions
// Sources:
//   - Aerospace Corporation reentry table: https://aerospace.org/reentries (via rss-proxy)
//   - CelesTrak recent decays: https://celestrak.org/satcat/search.php?DECAY=recent&FORMAT=json

export type ReentryObjectType = 'rocket-body' | 'debris' | 'satellite' | 'unknown';

export interface DebrisReentry {
  id: string;
  objectName: string;
  cosparId: string;
  noradId: number | null;
  massKg: number | null;
  objectType: ReentryObjectType;
  country: string;
  predictedTime: Date | null;
  uncertainty: string;
  predictedLat: number | null;
  predictedLon: number | null;
  survivability: SurvivabilityLevel;
  isAdversaryObject: boolean;
  severity: SeverityLevel;
}

type SurvivabilityLevel = 'high' | 'partial' | 'low';
type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface ReentryReport {
  predictions: DebrisReentry[];
  fetchedAt: Date;
}

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface Cache {
  report: ReentryReport;
  ts: number;
}

let _cache: Cache | null = null;

const AEROSPACE_ORG_URL = 'https://aerospace.org/reentries';
const CELESTRAK_DECAY_URL =
  'https://celestrak.org/satcat/search.php?CATNR=&INTLDES=&NAME=&DECAY=recent&FORMAT=json';

function proxyUrl(url: string): string {
  return `/api/rss-proxy?url=${encodeURIComponent(url)}`;
}

// eslint-disable-next-line sonarjs/slow-regex
const STRIP_TAGS_RE = /<[^>]+>/g;

function stripHtml(html: string): string {
  return html
    .replace(STRIP_TAGS_RE, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function detectObjectType(name: string): ReentryObjectType {
  const n = name.toUpperCase();
  if (/\bR\/B\b|ROCKET|BOOSTER|STAGE/.test(n)) return 'rocket-body';
  if (/\bDEB\b|DEBRIS|FRAGMENT/.test(n)) return 'debris';
  if (n.includes('R/B') || n.includes('RB')) return 'rocket-body';
  // If name has no debris/rocket markers but looks like a named object, call it satellite
  if (/^[A-Z0-9\s\-]+$/.test(n) && n.length > 3) return 'satellite';
  return 'unknown';
}

// Infer country from COSPAR ID or object name
function detectCountry(_cosparId: string, objectName: string): string {
  // COSPAR ID format: YYYY-NNNXX where YYYY is launch year, NNN is launch number, XX is piece
  // The originating country is not directly encoded in COSPAR ID but can be inferred from name.
  const name = objectName.toUpperCase();

  // Russian/Soviet origin
  // eslint-disable-next-line sonarjs/regex-complexity
  if (/\b(COSMOS|KOSMOS|PROTON|SOYUZ|PROGRESS|MOLNIYA|ZENIT|ROKOT|STRELA|RADUGA|GORIZONT|EKSPRESS|LUCH|YAMAL|MERIDIAN|GONETS|URAGAN|GLONASS|ELEKTRO|RESURS|SICH|OKEAN|METEOR|TSELINA|PARUS|TSIKLON|TSIKADA)\b/.test(name)) {
    return 'Russia';
  }

  // Chinese origin
  if (/\b(CZ-|FENGYUN|TIANGONG|SHENZHOU|TIANHE|WENTIAN|MENGTIAN|BEIDOU|YAOGAN|HAIYANG|ZIYUAN|SHIYAN|SHIJIAN|CHANG\'E|TIANWEN|ZHONGXING|CHINASAT)\b/.test(name) ||
      /^CZ[\s-]/.test(name)) {
    return 'China';
  }

  // US origin
  if (/\b(ATLAS|DELTA|FALCON|THOR|TITAN|CENTAUR|AGENA|STARLINK|GPS|NAVSTAR|DMSP|DSP|AEHF|WGS|MUOS|SBIRS|NROL)\b/.test(name)) {
    return 'USA';
  }

  // European
  if (/\b(ARIANE|VEGA|GALILEO|ENVISAT|SENTINEL|METEOSAT|SPOT)\b/.test(name)) {
    return 'ESA/Europe';
  }

  // Japanese
  if (/\b(H-II|H2|HTV|HAYABUSA|AKATSUKI|HIMAWARI|ALOS)\b/.test(name)) {
    return 'Japan';
  }

  // Indian
  if (/\b(PSLV|GSLV|CARTOSAT|RESOURCESAT|RISAT|IRNSS|NAVIC)\b/.test(name)) {
    return 'India';
  }

  return 'Unknown';
}

function isAdversaryCountry(country: string): boolean {
  return /russia|soviet|china|prc|dprk|north korea|iran/i.test(country);
}

function computeSurvivability(massKg: number | null, objectType: ReentryObjectType): SurvivabilityLevel {
  const mass = massKg ?? 0;
  if (objectType === 'rocket-body') {
    // Rocket bodies are generally dense metal, higher survivability
    if (mass > 3000) return 'high';
    if (mass > 500) return 'partial';
    return 'partial'; // even small rocket bodies have metallic parts
  }
  if (mass > 10_000) return 'high';
  if (mass >= 1000) return 'partial';
  return 'low';
}

function computeSeverity(
  survivability: SurvivabilityLevel,
  isAdversaryObject: boolean,
  predictedLat: number | null,
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  _predictedLon: number | null,
): SeverityLevel {
  // Populated area heuristic: roughly equatorial/mid-latitude belt
  const isPopulatedLatitude = predictedLat !== null && Math.abs(predictedLat) < 60;

  if (survivability === 'high' && isAdversaryObject && isPopulatedLatitude) return 'critical';
  if (survivability === 'high') return 'high';
  if (survivability === 'partial') return 'medium';
  return 'low';
}

function getCellText(cells: Element[], idx: number): string {
  return idx >= 0 && idx < cells.length
    ? stripHtml(cells[idx]?.textContent ?? '').trim()
    : '';
}

// Parse Aerospace Corporation HTML reentry table
// Expected columns (0-indexed): Object | COSPAR ID | Mass (kg) | Reentry Time (UTC) | Latitude (°) | Longitude (°)
// eslint-disable-next-line sonarjs/cognitive-complexity
function parseAerospaceHtml(html: string): DebrisReentry[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const tables = doc.querySelectorAll('table');
  if (tables.length === 0) return [];

  const results: DebrisReentry[] = [];

  for (const table of tables) {
    const rows = table.querySelectorAll('tr');
    if (rows.length < 2) continue;

    // Try to detect header row to find column indices
    const headerRow = rows[0]!;
    const headers = [...headerRow.querySelectorAll('th, td')].map(
      th => th.textContent?.toLowerCase().trim() ?? '',
    );

    // Look for telltale header columns
    const hasReentryTable =
      headers.some(h => h.includes('cospar') || h.includes('object')) &&
      headers.some(h => h.includes('reentry') || h.includes('mass'));

    if (!hasReentryTable) continue;

    let colObject = headers.findIndex(h => h.includes('object'));
    let colCospar = headers.findIndex(h => h.includes('cospar'));
    let colMass = headers.findIndex(h => h.includes('mass'));
    let colTime = headers.findIndex(h => h.includes('reentry') || h.includes('time') || h.includes('date'));
    let colLat = headers.findIndex(h => h.includes('lat'));
    let colLon = headers.findIndex(h => h.includes('lon'));

    // Fall back to positional defaults if headers not found
    if (colObject < 0) colObject = 0;
    if (colCospar < 0) colCospar = 1;
    if (colMass < 0) colMass = 2;
    if (colTime < 0) colTime = 3;
    if (colLat < 0) colLat = 4;
    if (colLon < 0) colLon = 5;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!;
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 3) continue;

      const objectName = getCellText(cells, colObject);
      const cosparId = getCellText(cells, colCospar);
      const massStr = getCellText(cells, colMass);
      const timeStr = getCellText(cells, colTime);
      const latStr = getCellText(cells, colLat);
      const lonStr = getCellText(cells, colLon);

      if (!objectName && !cosparId) continue;

      const massKg = massStr ? Number.parseFloat(massStr.replace(/[^\d.]/g, '')) || null : null;
      const predictedTime = timeStr ? new Date(timeStr) : null;
      const validTime = predictedTime && !Number.isNaN(predictedTime.getTime()) ? predictedTime : null;
      const predictedLat = latStr ? Number.parseFloat(latStr) : null;
      const predictedLon = lonStr ? Number.parseFloat(lonStr) : null;

      const objectType = detectObjectType(objectName);
      const country = detectCountry(cosparId, objectName);
      const isAdversaryObject = isAdversaryCountry(country);
      const survivability = computeSurvivability(
        Number.isFinite(massKg ?? Number.NaN) ? massKg : null,
        objectType,
      );
      const severity = computeSeverity(survivability, isAdversaryObject, predictedLat, predictedLon);

      results.push({
        id: cosparId || `aero-${objectName.replace(/\W/g, '').slice(0, 20)}-${i}`,
        objectName: objectName || 'Unknown Object',
        cosparId: cosparId || '',
        noradId: null,
        massKg: Number.isFinite(massKg ?? Number.NaN) ? massKg : null,
        objectType,
        country,
        predictedTime: validTime,
        uncertainty: '',
        predictedLat: Number.isFinite(predictedLat ?? Number.NaN) ? predictedLat : null,
        predictedLon: Number.isFinite(predictedLon ?? Number.NaN) ? predictedLon : null,
        survivability,
        isAdversaryObject,
        severity,
      });
    }
  }

  return results;
}

// CelesTrak SATCAT recently decayed objects JSON
interface CelesTrakSatCatEntry {
  INTLDES?: string;
  NORAD_CAT_ID?: number;
  SATNAME?: string;
  DECAY?: string; // ISO date of decay
  OBJECT_TYPE?: string; // 'PAYLOAD', 'ROCKET BODY', 'DEBRIS', 'TBA', 'UNKNOWN'
  COUNTRY?: string; // country code
}

function parseCelesTrakDecay(entries: CelesTrakSatCatEntry[]): DebrisReentry[] {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  return entries.flatMap((entry): DebrisReentry[] => {
    const decayStr = entry.DECAY ?? '';
    if (!decayStr) return [];

    const decayDate = new Date(decayStr);
    if (Number.isNaN(decayDate.getTime())) return [];

    // Only include recent decays (last 30 days) — these are confirmed reentries
    // Skip if older than 30 days (historical)
    if (decayDate.getTime() < thirtyDaysAgo) return [];

    const objectName = (entry.SATNAME ?? '').trim();
    const cosparId = (entry.INTLDES ?? '').trim();
    const rawType = (entry.OBJECT_TYPE ?? '').toUpperCase();

    let objectType: ReentryObjectType;
    if (rawType === 'PAYLOAD') objectType = 'satellite';
    else if (rawType === 'ROCKET BODY') objectType = 'rocket-body';
    else if (rawType === 'DEBRIS') objectType = 'debris';
    else objectType = detectObjectType(objectName);

    const country = detectCountry(cosparId, objectName);
    const isAdversaryObject = isAdversaryCountry(country);

    // CelesTrak doesn't give mass — use type heuristics
    const massKgByType: Record<ReentryObjectType, number> = { 'rocket-body': 2000, satellite: 500, debris: 100, unknown: 100 };
    const massKg = massKgByType[objectType];
    const survivability = computeSurvivability(massKg, objectType);
    const severity = computeSeverity(survivability, isAdversaryObject, null, null);

    return [{
      id: cosparId || `ct-${entry.NORAD_CAT_ID ?? objectName.replace(/\W/g, '').slice(0, 20)}`,
      objectName: objectName || 'Unknown Object',
      cosparId,
      noradId: entry.NORAD_CAT_ID ?? null,
      massKg: null, // not provided by CelesTrak SATCAT
      objectType,
      country,
      predictedTime: decayDate, // confirmed decay time
      uncertainty: 'Confirmed decay',
      predictedLat: null,
      predictedLon: null,
      survivability,
      isAdversaryObject,
      severity,
    }];
  });
}

export async function fetchDebrisReentries(): Promise<ReentryReport> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) return _cache.report;

  const [aerospaceResult, celestrakResult] = await Promise.allSettled([
    fetch(proxyUrl(AEROSPACE_ORG_URL), {
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: 'text/html,*/*' },
    }).then(async (res) => {
      if (!res.ok) return [] as DebrisReentry[];
      return await res.text().then(parseAerospaceHtml);
    }),
    fetch(CELESTRAK_DECAY_URL, {
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: 'application/json' },
    }).then(async (res) => {
      if (!res.ok) return [] as DebrisReentry[];
      return await res.json().then((data: CelesTrakSatCatEntry[]) =>
        Array.isArray(data) ? parseCelesTrakDecay(data) : [],
      );
    }),
  ]);

  const combined: DebrisReentry[] = [
    ...(aerospaceResult.status === 'fulfilled' ? aerospaceResult.value : []),
    ...(celestrakResult.status === 'fulfilled' ? celestrakResult.value : []),
  ];

  // Deduplicate by COSPAR ID
  const seen = new Set<string>();
  const deduped: DebrisReentry[] = [];
  for (const entry of combined) {
    const key = entry.cosparId || entry.id;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(entry);
    }
  }

  // Sort: critical first, then by predicted time ascending (soonest first)
  const SEVERITY_ORDER: Record<'critical' | 'high' | 'medium' | 'low', number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  deduped.sort((a, b) => {
    const diff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (diff !== 0) return diff;
    const ta = a.predictedTime?.getTime() ?? Infinity;
    const tb = b.predictedTime?.getTime() ?? Infinity;
    return ta - tb;
  });

  const report: ReentryReport = {
    predictions: deduped.slice(0, 50),
    fetchedAt: new Date(),
  };

  _cache = { report, ts: Date.now() };
  return report;
}

export function reentrySeverityClass(severity: DebrisReentry['severity']): string {
  return {
    critical: 'eq-row eq-major',
    high:     'eq-row eq-strong',
    medium:   'eq-row eq-moderate',
    low:      'eq-row',
  }[severity] ?? 'eq-row';
}
