import {
  Cartesian3,
  Color,
  CustomDataSource,
  HeightReference,
  HorizontalOrigin,
  VerticalOrigin,
  type Viewer,
  NearFarScalar,
  DistanceDisplayCondition,
  PolylineDashMaterialProperty,
} from 'cesium';

import { UNDERSEA_CABLES, NUCLEAR_FACILITIES } from '@/config/geo';

// Colors for data layer categories
const COLORS = {
  earthquake: Color.ORANGERED,
  earthquakeMinor: Color.ORANGE.withAlpha(0.6),
  conflict: Color.RED,
  nuclear: Color.YELLOW,
  nuclearWeapons: Color.fromCssColorString('#ff4444'),
  cable: Color.fromCssColorString('#60a5fa').withAlpha(0.4),
  cableMajor: Color.fromCssColorString('#60a5fa').withAlpha(0.7),
  flight: Color.fromCssColorString('#34d399'),
  vessel: Color.fromCssColorString('#818cf8'),
  vesselDark: Color.fromCssColorString('#f87171'),
  cyber: Color.fromCssColorString('#a78bfa'),
  gdacs: Color.fromCssColorString('#fbbf24'),
  gdacsRed: Color.RED,
  protest: Color.fromCssColorString('#fb923c'),
} as const;

// Shared label offset (Cesium Cartesian2 via Cartesian3 cast)
const LABEL_OFFSET = new Cartesian3(0, -14, 0) as unknown as import('cesium').Cartesian2;
const LABEL_OFFSET_SM = new Cartesian3(0, -12, 0) as unknown as import('cesium').Cartesian2;

interface GlobeLayer {
  source: CustomDataSource;
  load: () => void | Promise<void>;
  loaded: boolean;
}

export class GlobeDataManager {
  private viewer: Viewer;
  private layers = new Map<string, GlobeLayer>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  initialize(): void {
    this.registerLayer('nuclear', () => this.loadNuclearFacilities());
    this.registerLayer('cables', () => this.loadUnderseaCables());
    this.registerLayer('earthquakes', () => this.loadEarthquakes());
    this.registerLayer('gdacs', () => this.loadGDACS());
    this.registerLayer('conflicts', () => this.loadConflicts());
    this.registerLayer('cyber', () => this.loadCyberThreats());
    this.registerLayer('flights', () => this.loadMilitaryFlights());
    this.registerLayer('vessels', () => this.loadMilitaryVessels());
    this.registerLayer('protests', () => this.loadProtests());

    // Load all layers — each handles its own errors
    for (const name of this.layers.keys()) {
      void this.loadLayer(name);
    }
  }

  private registerLayer(name: string, load: () => void | Promise<void>): void {
    const source = new CustomDataSource(name);
    void this.viewer.dataSources.add(source);
    this.layers.set(name, { source, load, loaded: false });
  }

  private async loadLayer(name: string): Promise<void> {
    const layer = this.layers.get(name);
    if (!layer || layer.loaded) return;
    try {
      await layer.load();
      layer.loaded = true;
    } catch {
      // Non-fatal — other layers continue loading
    }
  }

  // ── Static Layers ─────────────────────────────────────────

  private loadNuclearFacilities(): void {
    const layer = this.layers.get('nuclear');
    if (!layer) return;

    for (const f of NUCLEAR_FACILITIES) {
      const isWeapons = f.type === 'weapons' || f.type === 'icbm' ||
        f.type === 'ssbn' || f.type === 'test-site';
      const color = isWeapons ? COLORS.nuclearWeapons : COLORS.nuclear;

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(f.lon, f.lat),
        point: {
          pixelSize: isWeapons ? 10 : 7,
          color,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.5),
        },
        label: {
          text: f.name,
          font: '11px monospace',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 5e6),
        },
        description: `${f.name} — ${f.type} (${f.status})`,
      });
    }
  }

  private loadUnderseaCables(): void {
    const layer = this.layers.get('cables');
    if (!layer) return;

    for (const cable of UNDERSEA_CABLES) {
      if (cable.points.length < 2) continue;
      const positions = cable.points.map(([lon, lat]: [number, number]) =>
        Cartesian3.fromDegrees(lon, lat),
      );

      layer.source.entities.add({
        polyline: {
          positions,
          width: cable.major ? 2 : 1,
          material: new PolylineDashMaterialProperty({
            color: cable.major ? COLORS.cableMajor : COLORS.cable,
            dashLength: 16,
          }),
          clampToGround: true,
        },
        description: cable.capacityTbps
          ? cable.name + ' — ' + String(cable.capacityTbps) + ' Tbps'
          : cable.name,
      });

      if (cable.landingPoints) {
        for (const lp of cable.landingPoints) {
          layer.source.entities.add({
            position: Cartesian3.fromDegrees(lp.lon, lp.lat),
            point: {
              pixelSize: 4,
              color: COLORS.cableMajor,
              outlineColor: Color.BLACK,
              outlineWidth: 1,
              heightReference: HeightReference.CLAMP_TO_GROUND,
            },
          });
        }
      }
    }
  }

  // ── Dynamic Layers ────────────────────────────────────────

  private async loadEarthquakes(): Promise<void> {
    const layer = this.layers.get('earthquakes');
    if (!layer) return;

    const { fetchEarthquakes } = await import('@/services/earthquakes');
    const quakes = await fetchEarthquakes();

    for (const eq of quakes) {
      const lat = eq.location?.latitude;
      const lon = eq.location?.longitude;
      if (lat == null || lon == null) continue;

      const isMajor = eq.magnitude >= 5;
      const size = Math.max(5, eq.magnitude * 2);
      const color = isMajor ? COLORS.earthquake : COLORS.earthquakeMinor;

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(lon, lat),
        point: {
          pixelSize: size,
          color,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.5),
        },
        label: isMajor ? {
          text: `M${eq.magnitude.toFixed(1)}`,
          font: '10px monospace',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET_SM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 1e7),
        } : undefined,
        description: `${eq.place} — M${eq.magnitude} at ${eq.depthKm}km depth`,
      });
    }
  }

  private async loadGDACS(): Promise<void> {
    const layer = this.layers.get('gdacs');
    if (!layer) return;

    const { fetchGDACSEvents } = await import('@/services/gdacs');
    const events = await fetchGDACSEvents();

    for (const ev of events) {
      const isRed = ev.alertLevel === 'Red';
      const color = isRed ? COLORS.gdacsRed : COLORS.gdacs;
      const [lon, lat] = ev.coordinates;

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(lon, lat),
        point: {
          pixelSize: isRed ? 12 : 8,
          color,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.6),
        },
        label: {
          text: `${ev.eventType} ${ev.name}`,
          font: '10px monospace',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 8e6),
        },
        description: `${ev.name} — ${ev.alertLevel} alert (${ev.country})`,
      });
    }
  }

  private async loadConflicts(): Promise<void> {
    const layer = this.layers.get('conflicts');
    if (!layer) return;

    const { fetchConflictEvents } = await import('@/services/conflict');
    const data = await fetchConflictEvents();

    for (const ev of data.events) {
      layer.source.entities.add({
        position: Cartesian3.fromDegrees(ev.lon, ev.lat),
        point: {
          pixelSize: Math.min(10, 5 + ev.fatalities * 0.5),
          color: COLORS.conflict,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.2, 1e7, 0.3),
        },
      });
    }
  }

  private async loadCyberThreats(): Promise<void> {
    const layer = this.layers.get('cyber');
    if (!layer) return;

    const { fetchCyberThreats } = await import('@/services/cyber');
    const threats = await fetchCyberThreats({ limit: 200 });

    for (const t of threats) {
      if (!t.lat || !t.lon) continue;
      layer.source.entities.add({
        position: Cartesian3.fromDegrees(t.lon, t.lat),
        point: {
          pixelSize: 5,
          color: COLORS.cyber,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0.2),
        },
      });
    }
  }

  private async loadMilitaryFlights(): Promise<void> {
    const layer = this.layers.get('flights');
    if (!layer) return;

    const { fetchMilitaryFlights } = await import('@/services/military-flights');
    const { flights } = await fetchMilitaryFlights();

    for (const f of flights) {
      layer.source.entities.add({
        position: Cartesian3.fromDegrees(f.lon, f.lat, f.altitude * 0.3048), // feet → meters
        point: {
          pixelSize: 7,
          color: COLORS.flight,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.5),
        },
        label: {
          text: f.callsign || f.hexCode,
          font: '10px monospace',
          fillColor: COLORS.flight,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET_SM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 3e6),
        },
        description: `${f.callsign || 'Unknown'} — ${f.aircraftModel ?? f.aircraftType}`,
      });
    }
  }

  private async loadMilitaryVessels(): Promise<void> {
    const layer = this.layers.get('vessels');
    if (!layer) return;

    const { fetchMilitaryVessels } = await import('@/services/military-vessels');
    const { vessels } = await fetchMilitaryVessels();

    for (const v of vessels) {
      const color = v.isDark ? COLORS.vesselDark : COLORS.vessel;

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(v.lon, v.lat),
        point: {
          pixelSize: v.isDark ? 8 : 6,
          color,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.5),
        },
        label: {
          text: v.name || v.mmsi,
          font: '10px monospace',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET_SM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 2e6),
        },
        description: `${v.name || v.mmsi} — ${v.vesselType}${v.isDark ? ' (DARK SHIP)' : ''}`,
      });
    }
  }

  private async loadProtests(): Promise<void> {
    const layer = this.layers.get('protests');
    if (!layer) return;

    const { fetchProtestEvents } = await import('@/services/unrest');
    const data = await fetchProtestEvents();

    for (const ev of data.events) {
      layer.source.entities.add({
        position: Cartesian3.fromDegrees(ev.lon, ev.lat),
        point: {
          pixelSize: 5,
          color: COLORS.protest,
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0.2),
        },
      });
    }
  }

  destroy(): void {
    for (const [, layer] of this.layers) {
      this.viewer.dataSources.remove(layer.source, true);
    }
    this.layers.clear();
  }
}
