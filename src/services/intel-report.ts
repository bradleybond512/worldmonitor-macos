/**
 * @module intel-report
 *
 * Intelligence Report Generator — pure TypeScript, fully offline
 *
 * Generates SITREP (Situation Report), INTSUM (Intelligence Summary),
 * SPOT (Spot Report), and WARNING formatted reports from current threat
 * data snapshots. Reports are stored in-memory with automatic pruning
 * when the maximum capacity (100 reports) is reached.
 *
 * Each report type produces a structured set of sections following
 * standard military/intelligence reporting formats:
 *   - SITREP:  Situation, Enemy Forces, Friendly Forces, Key Events, Assessment
 *   - INTSUM:  Executive Summary, Threat Assessment, Collection Gaps, Recommendations
 *   - SPOT:    Flash Alert, Details, Immediate Actions
 *   - WARNING: Threat Description, Indicators, Recommended Actions, Timeline
 *
 * No external dependencies, no network calls. All state is in-memory.
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** Supported intelligence report formats */
export type ReportType = 'sitrep' | 'intsum' | 'spot' | 'warning';

/** A single section within a report */
export interface ReportSection {
  /** Section heading */
  title: string;
  /** Section body text */
  content: string;
  /** Optional classification marking for this section */
  classification?: string;
}

/** A complete intelligence report */
export interface IntelReport {
  /** Unique identifier (auto-generated) */
  id: string;
  /** Report format type */
  type: ReportType;
  /** Human-readable report title */
  title: string;
  /** Unix ms timestamp — when this report was generated */
  timestamp: number;
  /** Ordered list of report sections */
  sections: ReportSection[];
  /** Brief executive summary */
  summary: string;
  /** Overall assessed threat level */
  threatLevel: 'low' | 'moderate' | 'elevated' | 'high' | 'critical';
  /** Geographic region of focus, if applicable */
  region?: string;
  /** Generating analyst or system attribution */
  author: string;
}

/** Input data used to generate a report */
export interface ReportInputData {
  /** Geographic region of focus */
  region?: string;
  /** Active threats to include in the report */
  threats: { source: string; description: string; severity: string }[];
  /** Notable events to include */
  events: { title: string; timestamp: number; location?: string }[];
  /** Optional analyst recommendations */
  recommendations?: string[];
}

/** Aggregated statistics for dashboard display */
export interface ReportStats {
  /** Total number of reports in memory */
  totalReports: number;
  /** Count of reports by type */
  byType: Record<ReportType, number>;
  /** Most recently generated report, if any */
  latestReport: IntelReport | undefined;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Maximum reports retained in memory before oldest are pruned */
const MAX_REPORTS = 100;

/** Default author attribution for auto-generated reports */
const DEFAULT_AUTHOR = 'World Monitor SIGINT';

/** Human-readable titles keyed by report type */
const REPORT_TYPE_TITLES: Record<ReportType, string> = {
  sitrep: 'SITREP',
  intsum: 'INTSUM',
  spot: 'SPOT REPORT',
  warning: 'WARNING ORDER',
};

// ── In-memory Store ───────────────────────────────────────────────────────

/** In-memory report storage, newest first */
const reports: IntelReport[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────

/** Generate a unique report identifier */
function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `rpt-${ts}-${rand}`;
}

/** Derive threat level from input data severity counts */
function assessThreatLevel(
  threats: ReportInputData['threats'],
): IntelReport['threatLevel'] {
  if (threats.length === 0) return 'low';

  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const t of threats) {
    const s = t.severity.toLowerCase();
    if (s === 'critical') severityCounts.critical++;
    else if (s === 'high') severityCounts.high++;
    else if (s === 'medium' || s === 'moderate') severityCounts.medium++;
    else severityCounts.low++;
  }

  if (severityCounts.critical > 0) return 'critical';
  if (severityCounts.high >= 2) return 'high';
  if (severityCounts.high >= 1 || severityCounts.medium >= 3) return 'elevated';
  if (severityCounts.medium >= 1) return 'moderate';
  return 'low';
}

/** Format a Unix ms timestamp as a UTC datetime string */
function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, 'Z');
}

/** Build the summary line for a report */
function buildSummary(
  type: ReportType,
  data: ReportInputData,
  threatLevel: IntelReport['threatLevel'],
): string {
  const regionStr = data.region ? ` in ${data.region}` : '';
  const threatCount = data.threats.length;
  const eventCount = data.events.length;
  return (
    `${REPORT_TYPE_TITLES[type]}: ${threatCount} threat${threatCount !== 1 ? 's' : ''} ` +
    `and ${eventCount} event${eventCount !== 1 ? 's' : ''} assessed${regionStr}. ` +
    `Overall threat level: ${threatLevel.toUpperCase()}.`
  );
}

// ── Section Builders ──────────────────────────────────────────────────────

function buildSitrepSections(data: ReportInputData): ReportSection[] {
  const now = Date.now();

  const situation =
    data.region
      ? `Current operational environment in ${data.region}. ` +
        `${data.threats.length} active threat(s) tracked; ${data.events.length} event(s) recorded.`
      : `${data.threats.length} active threat(s) tracked globally; ${data.events.length} event(s) recorded.`;

  const enemyForces = data.threats.length > 0
    ? data.threats
        .map((t) => `- [${t.severity.toUpperCase()}] ${t.source}: ${t.description}`)
        .join('\n')
    : 'No hostile activity observed.';

  const friendlyForces = 'All monitoring systems operational. Collection assets nominal.';

  const keyEvents = data.events.length > 0
    ? data.events
        .map((e) => {
          const loc = e.location ? ` (${e.location})` : '';
          const age = Math.round((now - e.timestamp) / 60_000);
          return `- ${e.title}${loc} — ${age}m ago`;
        })
        .join('\n')
    : 'No significant events during reporting period.';

  const assessment =
    data.recommendations && data.recommendations.length > 0
      ? data.recommendations.map((r) => `- ${r}`).join('\n')
      : 'Continue monitoring. No change to threat posture recommended.';

  return [
    { title: 'Situation', content: situation },
    { title: 'Enemy Forces', content: enemyForces },
    { title: 'Friendly Forces', content: friendlyForces },
    { title: 'Key Events', content: keyEvents },
    { title: 'Assessment', content: assessment },
  ];
}

function buildIntsumSections(data: ReportInputData): ReportSection[] {
  const execSummary =
    `This intelligence summary covers ${data.threats.length} threat(s) ` +
    `and ${data.events.length} event(s)` +
    (data.region ? ` in the ${data.region} region.` : ' across all monitored regions.');

  const threatAssessment = data.threats.length > 0
    ? data.threats
        .map((t) => `[${t.severity.toUpperCase()}] ${t.source}\n  ${t.description}`)
        .join('\n\n')
    : 'No actionable threat intelligence during this period.';

  const collectionGaps =
    'Automated collection ongoing. Gaps may exist in HUMINT and ' +
    'classified source reporting. Manual validation recommended for high-severity items.';

  const recommendations =
    data.recommendations && data.recommendations.length > 0
      ? data.recommendations.map((r) => `- ${r}`).join('\n')
      : '- Maintain current collection posture.\n- Reassess in next reporting cycle.';

  return [
    { title: 'Executive Summary', content: execSummary },
    { title: 'Threat Assessment', content: threatAssessment },
    { title: 'Collection Gaps', content: collectionGaps },
    { title: 'Recommendations', content: recommendations },
  ];
}

function buildSpotSections(data: ReportInputData): ReportSection[] {
  const topThreat = data.threats[0];
  const flashAlert = topThreat
    ? `FLASH: ${topThreat.source} — ${topThreat.description} [${topThreat.severity.toUpperCase()}]`
    : 'No immediate threat identified.';

  const details: string[] = [];
  for (const t of data.threats) {
    details.push(`Source: ${t.source} | Severity: ${t.severity.toUpperCase()}\n${t.description}`);
  }
  for (const e of data.events) {
    const loc = e.location ? ` at ${e.location}` : '';
    details.push(`Event: ${e.title}${loc} — ${formatTimestamp(e.timestamp)}`);
  }

  const immediateActions =
    data.recommendations && data.recommendations.length > 0
      ? data.recommendations.map((r) => `- ${r}`).join('\n')
      : '- Acknowledge receipt.\n- Elevate to watch officer if criteria met.';

  return [
    { title: 'Flash Alert', content: flashAlert },
    { title: 'Details', content: details.join('\n\n') || 'No additional details.' },
    { title: 'Immediate Actions', content: immediateActions },
  ];
}

function buildWarningSections(data: ReportInputData): ReportSection[] {
  const threatDescription = data.threats.length > 0
    ? data.threats
        .map((t) => `${t.source} [${t.severity.toUpperCase()}]: ${t.description}`)
        .join('\n')
    : 'No specific threat identified.';

  const indicators = data.events.length > 0
    ? data.events
        .map((e) => {
          const loc = e.location ? ` (${e.location})` : '';
          return `- ${e.title}${loc} — ${formatTimestamp(e.timestamp)}`;
        })
        .join('\n')
    : 'No corroborating indicators at this time.';

  const recommendedActions =
    data.recommendations && data.recommendations.length > 0
      ? data.recommendations.map((r) => `- ${r}`).join('\n')
      : '- Increase monitoring frequency.\n- Prepare contingency plans.';

  const now = Date.now();
  const timeline =
    `Warning issued: ${formatTimestamp(now)}\n` +
    `Next assessment due: ${formatTimestamp(now + 6 * 3_600_000)}`;

  return [
    { title: 'Threat Description', content: threatDescription },
    { title: 'Indicators', content: indicators },
    { title: 'Recommended Actions', content: recommendedActions },
    { title: 'Timeline', content: timeline },
  ];
}

/** Dispatch to the correct section builder */
const SECTION_BUILDERS: Record<ReportType, (data: ReportInputData) => ReportSection[]> = {
  sitrep: buildSitrepSections,
  intsum: buildIntsumSections,
  spot: buildSpotSections,
  warning: buildWarningSections,
};

// ── Pruning ───────────────────────────────────────────────────────────────

/** Remove oldest reports when store exceeds MAX_REPORTS */
function pruneIfNeeded(): void {
  while (reports.length > MAX_REPORTS) {
    reports.pop(); // newest-first order → pop removes oldest
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Generate a new intelligence report from the provided input data.
 *
 * The report is automatically stored in memory and the oldest report
 * is pruned if the 100-report limit is exceeded.
 */
export function generateReport(type: ReportType, data: ReportInputData): IntelReport {
  const threatLevel = assessThreatLevel(data.threats);
  const sections = SECTION_BUILDERS[type](data);
  const summary = buildSummary(type, data, threatLevel);
  const regionStr = data.region ? ` — ${data.region}` : '';
  const now = Date.now();

  const report: IntelReport = {
    id: generateId(),
    type,
    title: `${REPORT_TYPE_TITLES[type]}${regionStr} — ${formatTimestamp(now)}`,
    timestamp: now,
    sections,
    summary,
    threatLevel,
    region: data.region,
    author: DEFAULT_AUTHOR,
  };

  reports.unshift(report); // newest first
  pruneIfNeeded();
  return report;
}

/**
 * Return all stored reports, ordered newest first.
 */
export function getReports(): IntelReport[] {
  return [...reports];
}

/**
 * Look up a single report by its unique identifier.
 */
export function getReportById(id: string): IntelReport | undefined {
  return reports.find((r) => r.id === id);
}

/**
 * Return aggregate statistics about stored reports.
 */
export function getReportStats(): ReportStats {
  const byType: Record<ReportType, number> = { sitrep: 0, intsum: 0, spot: 0, warning: 0 };
  for (const r of reports) {
    byType[r.type]++;
  }
  return {
    totalReports: reports.length,
    byType,
    latestReport: reports[0],
  };
}

/**
 * Delete a report by its unique identifier.
 *
 * @returns `true` if the report was found and removed, `false` otherwise.
 */
export function deleteReport(id: string): boolean {
  const idx = reports.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  reports.splice(idx, 1);
  return true;
}
