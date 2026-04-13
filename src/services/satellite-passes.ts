import { satellitePropagator, type SatellitePass } from './satellite-propagator';
import { fetchSatelliteCatalog, isReconOrMilitary } from './satellite-catalog';

let cachedPasses: SatellitePass[] = [];
let lastComputed = 0;
const RECOMPUTE_INTERVAL = 15 * 60 * 1000;
const listeners = new Set<(passes: SatellitePass[]) => void>();

export function getUpcomingPasses(): SatellitePass[] {
  return cachedPasses
    .filter(p => p.setTime > Date.now())
    .sort((a, b) => a.riseTime - b.riseTime);
}

export function getOverheadNow(): SatellitePass[] {
  const now = Date.now();
  return cachedPasses.filter(p => p.riseTime <= now && p.setTime >= now);
}

export function onPassesUpdated(listener: (passes: SatellitePass[]) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function computePasses(locations: { id: string; name: string; lat: number; lon: number }[]): Promise<void> {
  if (Date.now() - lastComputed < RECOMPUTE_INTERVAL) return;
  if (locations.length === 0) return;

  const catalog = await fetchSatelliteCatalog();
  const notable = catalog.filter(s => isReconOrMilitary(s.classification));

  satellitePropagator.requestPasses(notable, locations, 6);
  lastComputed = Date.now();
}

satellitePropagator.onPasses((passes) => {
  cachedPasses = passes;
  for (const listener of listeners) {
    listener(passes);
  }
});
