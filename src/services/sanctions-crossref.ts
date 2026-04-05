/**
 * Sanctions Cross-Reference Service — pure TypeScript, fully offline
 *
 * Maintains an in-memory sanctions watchlist (persons, organizations, vessels,
 * aircraft) and cross-references incoming names against it using fuzzy Dice
 * coefficient matching. Matches above the 0.6 confidence threshold are tracked
 * with full provenance. Aliases are checked alongside primary names.
 *
 * Capacity: 500 sanctioned entities, 1 000 stored matches. Oldest matches are
 * evicted when the cap is reached.
 *
 * Pre-seeded with a handful of demo OFAC-style entries (fictional names).
 *
 * No external dependencies, no network calls. All state is in-memory.
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** Entity type on the sanctions watchlist */
export type SanctionedEntityType = 'person' | 'organization' | 'vessel' | 'aircraft';

/** A sanctioned entity on the watchlist */
export interface SanctionedEntity {
  /** Unique identifier (auto-generated) */
  id: string;
  /** Primary name */
  name: string;
  /** Known aliases */
  aliases: string[];
  /** Entity classification */
  type: SanctionedEntityType;
  /** Originating sanctions list (e.g. "OFAC-SDN", "EU-Consolidated") */
  listSource: string;
  /** ISO country code or name */
  country?: string;
  /** Epoch ms when the entity was added to the list */
  addedDate: number;
  /** Free-text reason for designation */
  reason?: string;
}

/** A match produced by cross-referencing a name against the watchlist */
export interface SanctionsMatch {
  /** Unique match identifier (auto-generated) */
  id: string;
  /** ID of the sanctioned entity that matched */
  sanctionedEntityId: string;
  /** The name string that was matched */
  matchedName: string;
  /** Source / context the name appeared in */
  matchedIn: string;
  /** Dice coefficient confidence (0–1) */
  confidence: number;
  /** Epoch ms when the match was recorded */
  timestamp: number;
  /** Optional notes */
  details?: string;
}

/** Aggregate statistics for the sanctions service */
export interface SanctionsStats {
  /** Number of entities on the watchlist */
  totalEntities: number;
  /** Total matches ever recorded (capped at stored max) */
  totalMatches: number;
  /** Most recent matches (up to 50) */
  recentMatches: SanctionsMatch[];
  /** Entity count per list source */
  byList: Record<string, number>;
  /** Entity count per type */
  byType: Record<string, number>;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_ENTITIES = 500;
const MAX_MATCHES = 1_000;
const MATCH_THRESHOLD = 0.6;

// ── State ──────────────────────────────────────────────────────────────────

let entities: SanctionedEntity[] = [];
let matches: SanctionsMatch[] = [];
let idCounter = 0;

// ── Helpers ────────────────────────────────────────────────────────────────

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

/**
 * Dice coefficient (bigram similarity) between two strings.
 * Returns 1 for exact (case-insensitive) matches, 0 when either string
 * is shorter than 2 characters, and a value in (0, 1) otherwise.
 */
function diceCoefficient(a: string, b: string): number {
  const aN = a.toLowerCase();
  const bN = b.toLowerCase();
  if (aN === bN) return 1;
  if (aN.length < 2 || bN.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < aN.length - 1; i++) {
    const bi = aN.slice(i, i + 2);
    bigrams.set(bi, (bigrams.get(bi) ?? 0) + 1);
  }

  let matchCount = 0;
  for (let i = 0; i < bN.length - 1; i++) {
    const bi = bN.slice(i, i + 2);
    const count = bigrams.get(bi);
    if (count && count > 0) {
      matchCount++;
      bigrams.set(bi, count - 1);
    }
  }

  return (2 * matchCount) / (aN.length - 1 + bN.length - 1);
}

/**
 * Check a single name against one sanctioned entity (primary + aliases).
 * Returns the best Dice coefficient found.
 */
function bestScore(name: string, entity: SanctionedEntity): number {
  let best = diceCoefficient(name, entity.name);
  for (const alias of entity.aliases) {
    const score = diceCoefficient(name, alias);
    if (score > best) best = score;
  }
  return best;
}

/** Trim the matches array to MAX_MATCHES, keeping the newest entries. */
function trimMatches(): void {
  if (matches.length > MAX_MATCHES) {
    matches = matches.slice(matches.length - MAX_MATCHES);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Add a single sanctioned entity to the watchlist.
 * Returns the created entity with its generated ID.
 * Silently drops the entity if the watchlist is at capacity.
 */
export function addSanctionedEntity(
  entity: Omit<SanctionedEntity, 'id'>,
): SanctionedEntity {
  if (entities.length >= MAX_ENTITIES) {
    const full: SanctionedEntity = { ...entity, id: nextId('se') };
    // At capacity — return without storing
    return full;
  }
  const created: SanctionedEntity = { ...entity, id: nextId('se') };
  entities.push(created);
  return created;
}

/**
 * Bulk-add sanctioned entities. Returns the count actually added
 * (may be less than input length if the cap is reached).
 */
export function bulkAddSanctioned(
  incoming: Array<Omit<SanctionedEntity, 'id'>>,
): number {
  let added = 0;
  for (const e of incoming) {
    if (entities.length >= MAX_ENTITIES) break;
    entities.push({ ...e, id: nextId('se') });
    added++;
  }
  return added;
}

/**
 * Check a single name against the full watchlist. Returns all matches
 * with a Dice coefficient ≥ 0.6, sorted by confidence descending.
 * Matches are recorded in the internal history.
 */
export function checkName(name: string, source: string): SanctionsMatch[] {
  const hits: SanctionsMatch[] = [];
  for (const entity of entities) {
    const score = bestScore(name, entity);
    if (score >= MATCH_THRESHOLD) {
      const m: SanctionsMatch = {
        id: nextId('sm'),
        sanctionedEntityId: entity.id,
        matchedName: name,
        matchedIn: source,
        confidence: Math.round(score * 1000) / 1000,
        timestamp: Date.now(),
      };
      hits.push(m);
      matches.push(m);
    }
  }
  trimMatches();
  return hits.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Batch-check multiple names. Returns all matches across all names,
 * sorted by confidence descending.
 */
export function checkNames(
  names: Array<{ name: string; source: string }>,
): SanctionsMatch[] {
  const all: SanctionsMatch[] = [];
  for (const { name, source } of names) {
    all.push(...checkName(name, source));
  }
  return all.sort((a, b) => b.confidence - a.confidence);
}

/** Return all recorded matches, newest first. */
export function getMatches(): SanctionsMatch[] {
  return [...matches].reverse();
}

/** Return all sanctioned entities on the watchlist. */
export function getSanctionedEntities(): SanctionedEntity[] {
  return [...entities];
}

/** Aggregate statistics for the sanctions service. */
export function getSanctionsStats(): SanctionsStats {
  const byList: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const e of entities) {
    byList[e.listSource] = (byList[e.listSource] ?? 0) + 1;
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  }

  const recent = [...matches]
    .reverse()
    .slice(0, 50);

  return {
    totalEntities: entities.length,
    totalMatches: matches.length,
    recentMatches: recent,
    byList,
    byType,
  };
}

/** Clear all stored matches. Does not affect the entity watchlist. */
export function clearMatches(): void {
  matches = [];
}

// ── Demo Seed ──────────────────────────────────────────────────────────────

/** Pre-seed fictional OFAC-style entries for demonstration. */
function seedDemoEntities(): void {
  const demo: Array<Omit<SanctionedEntity, 'id'>> = [
    {
      name: 'ACME Holdings Ltd',
      aliases: ['ACME International', 'ACME Group'],
      type: 'organization',
      listSource: 'OFAC-SDN',
      country: 'XX',
      addedDate: Date.now() - 180 * 86_400_000,
      reason: 'Proliferation financing network',
    },
    {
      name: 'Umbrella Corp Maritime',
      aliases: ['UCM Shipping', 'Umbrella Maritime LLC'],
      type: 'organization',
      listSource: 'OFAC-SDN',
      country: 'XX',
      addedDate: Date.now() - 90 * 86_400_000,
      reason: 'Sanctions evasion — vessel deceptive shipping practices',
    },
    {
      name: 'Viktor Bogdanov',
      aliases: ['V. Bogdanoff', 'Viktor B.'],
      type: 'person',
      listSource: 'OFAC-SDN',
      country: 'XX',
      addedDate: Date.now() - 365 * 86_400_000,
      reason: 'Designated pursuant to E.O. 13848 (demo)',
    },
    {
      name: 'MV Darkwater',
      aliases: ['Darkwater I', 'DW-7731'],
      type: 'vessel',
      listSource: 'OFAC-SDN',
      country: 'XX',
      addedDate: Date.now() - 60 * 86_400_000,
      reason: 'Vessel involved in illicit petroleum transfers (demo)',
    },
    {
      name: 'Nighthawk Aviation AG',
      aliases: ['Nighthawk Air', 'NH-Aviation'],
      type: 'aircraft',
      listSource: 'EU-Consolidated',
      country: 'XX',
      addedDate: Date.now() - 30 * 86_400_000,
      reason: 'Designated — unlicensed arms transport flights (demo)',
    },
  ];

  bulkAddSanctioned(demo);
}

seedDemoEntities();
