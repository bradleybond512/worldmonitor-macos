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
  ColorMaterialProperty,
  Math as CesiumMath,
} from 'cesium';

import {
  UNDERSEA_CABLES,
  NUCLEAR_FACILITIES,
  MILITARY_BASES,
  STRATEGIC_WATERWAYS,
  SPACEPORTS,
  CRITICAL_MINERALS,
  INTEL_HOTSPOTS,
} from '@/config/geo';

import {
  AIRCRAFT_ICONS,
  VESSEL_ICONS,
  GDACS_ICONS,
  ICON_NUCLEAR,
  ICON_EARTHQUAKE,
  ICON_EXPLOSION,
  ICON_CROSSHAIR,
  ICON_CYBER,
  ICON_CYBER_CRITICAL,
  ICON_PROTEST,
  ICON_CABLE_LANDING,
  ICON_TRANSPORT,
  ICON_WARSHIP,
  ICON_FIRE,
  ICON_BASE,
  ICON_BASE_NAVAL,
  ICON_BASE_AIR,
  ICON_AIRSTRIKE,
  ICON_DARK_VESSEL,
  ICON_GPS_JAM,
  ICON_SAT_CHANGE,
  ICON_VOLCANO,
  ICON_CYCLONE,
  ICON_DISEASE,
  ICON_SPACEPORT,
  ICON_CHOKEPOINT,
  ICON_MINERAL,
  ICON_HOTSPOT,
  ICON_DISPLACEMENT,
} from '@/config/globe-icons';

// ── Colors ──────────────────────────────────────────────────

const C = {
  // Seismic
  earthquake: Color.ORANGERED,
  earthquakeMinor: Color.ORANGE.withAlpha(0.8),
  // Conflict
  conflict: Color.RED,
  conflictExplosion: Color.fromCssColorString('#ff6b35'),
  airstrike: Color.fromCssColorString('#ff3333'),
  // Nuclear
  nuclear: Color.YELLOW,
  nuclearWeapons: Color.fromCssColorString('#ff4444'),
  // Cables
  cable: Color.fromCssColorString('#60a5fa').withAlpha(0.4),
  cableMajor: Color.fromCssColorString('#60a5fa').withAlpha(0.7),
  cableLanding: Color.fromCssColorString('#60a5fa'),
  // Aviation
  flight: Color.fromCssColorString('#34d399'),
  flightTrail: Color.fromCssColorString('#34d399').withAlpha(0.3),
  // Maritime
  vessel: Color.fromCssColorString('#818cf8'),
  vesselDark: Color.fromCssColorString('#f87171'),
  vesselTrail: Color.fromCssColorString('#818cf8').withAlpha(0.25),
  vesselDarkTrail: Color.fromCssColorString('#f87171').withAlpha(0.3),
  darkVessel: Color.fromCssColorString('#ef4444'),
  darkVesselCritical: Color.fromCssColorString('#dc2626'),
  // Cyber
  cyber: Color.fromCssColorString('#a78bfa'),
  cyberCritical: Color.fromCssColorString('#ef4444'),
  cyberHigh: Color.fromCssColorString('#f97316'),
  // Disasters
  gdacs: Color.fromCssColorString('#fbbf24'),
  gdacsRed: Color.RED,
  volcanoWarning: Color.RED,
  volcanoWatch: Color.fromCssColorString('#f97316'),
  volcanoAdvisory: Color.YELLOW,
  volcanoNormal: Color.fromCssColorString('#22c55e'),
  cycloneCat5: Color.fromCssColorString('#ff0000'),
  cycloneCat3: Color.fromCssColorString('#ff6600'),
  cycloneCat1: Color.fromCssColorString('#ffcc00'),
  cycloneStorm: Color.fromCssColorString('#00ccff'),
  // Fires
  fireHigh: Color.fromCssColorString('#ff4444'),
  fireNominal: Color.fromCssColorString('#ff8c00'),
  fireLow: Color.fromCssColorString('#ffa500').withAlpha(0.6),
  // Protests
  protest: Color.fromCssColorString('#fb923c'),
  protestHigh: Color.fromCssColorString('#ef4444'),
  // GPS
  gpsHigh: Color.fromCssColorString('#ef4444'),
  gpsMedium: Color.fromCssColorString('#f97316'),
  // Bases
  baseUS: Color.fromCssColorString('#3b82f6'),
  baseRussia: Color.fromCssColorString('#ef4444'),
  baseChina: Color.fromCssColorString('#f59e0b'),
  baseOther: Color.fromCssColorString('#9ca3af'),
  // Satellite change
  satChangeCritical: Color.fromCssColorString('#ef4444'),
  satChangeHigh: Color.fromCssColorString('#f97316'),
  satChangeMedium: Color.fromCssColorString('#eab308'),
  satChangeLow: Color.fromCssColorString('#22c55e'),
  // Disease
  diseaseCritical: Color.fromCssColorString('#dc2626'),
  diseaseHigh: Color.fromCssColorString('#f97316'),
  diseaseMedium: Color.fromCssColorString('#eab308'),
  // Displacement
  displacement: Color.fromCssColorString('#f472b6'),
  displacementHigh: Color.fromCssColorString('#ec4899'),
  displacementFlow: Color.fromCssColorString('#f472b6').withAlpha(0.2),
  // Infrastructure
  spaceport: Color.fromCssColorString('#06b6d4'),
  chokepoint: Color.fromCssColorString('#38bdf8'),
  mineral: Color.fromCssColorString('#a3e635'),
  // Intel
  hotspotHigh: Color.fromCssColorString('#ef4444'),
  hotspotElevated: Color.fromCssColorString('#f97316'),
  hotspotLow: Color.fromCssColorString('#eab308'),
} as const;

// ── Color / scale lookup helpers (avoids nested ternaries) ──

function baseColor(type: string): Color {
  if (type === 'us-nato') return C.baseUS;
  if (type === 'russia') return C.baseRussia;
  if (type === 'china') return C.baseChina;
  return C.baseOther;
}

function hotspotColor(level: string | undefined): Color {
  if (level === 'high') return C.hotspotHigh;
  if (level === 'elevated') return C.hotspotElevated;
  return C.hotspotLow;
}

function hotspotScale(level: string | undefined): number {
  if (level === 'high') return 0.45;
  if (level === 'elevated') return 0.38;
  return 0.3;
}

function volcanoColor(alertLevel: string): Color {
  if (alertLevel === 'Warning') return C.volcanoWarning;
  if (alertLevel === 'Watch') return C.volcanoWatch;
  if (alertLevel === 'Advisory') return C.volcanoAdvisory;
  return C.volcanoNormal;
}

function volcanoScale(alertLevel: string): number {
  if (alertLevel === 'Warning') return 0.45;
  if (alertLevel === 'Watch') return 0.38;
  return 0.3;
}

function cycloneColor(category: string, isCat3Plus: boolean, isCat1Plus: boolean): Color {
  if (category === 'category_5') return C.cycloneCat5;
  if (isCat3Plus) return C.cycloneCat3;
  if (isCat1Plus) return C.cycloneCat1;
  return C.cycloneStorm;
}

function cycloneScale(isCat5: boolean, isCat3Plus: boolean, isCat1Plus: boolean): number {
  if (isCat5) return 0.6;
  if (isCat3Plus) return 0.5;
  if (isCat1Plus) return 0.4;
  return 0.35;
}

function fireColor(confidence: string): Color {
  if (confidence === 'FIRE_CONFIDENCE_HIGH') return C.fireHigh;
  if (confidence === 'FIRE_CONFIDENCE_NOMINAL') return C.fireNominal;
  return C.fireLow;
}

function fireScale(confidence: string): number {
  if (confidence === 'FIRE_CONFIDENCE_HIGH') return 0.3;
  if (confidence === 'FIRE_CONFIDENCE_NOMINAL') return 0.22;
  return 0.16;
}

function cyberColor(severity: string): Color {
  if (severity === 'critical') return C.cyberCritical;
  if (severity === 'high') return C.cyberHigh;
  return C.cyber;
}

function satChangeColor(severity: string): Color {
  if (severity === 'critical') return C.satChangeCritical;
  if (severity === 'high') return C.satChangeHigh;
  if (severity === 'medium') return C.satChangeMedium;
  return C.satChangeLow;
}

function diseaseColor(casesPerM: number): Color {
  if (casesPerM > 1000) return C.diseaseCritical;
  if (casesPerM > 100) return C.diseaseHigh;
  return C.diseaseMedium;
}

function diseaseScale(casesPerM: number): number {
  if (casesPerM > 1000) return 0.35;
  if (casesPerM > 100) return 0.28;
  return 0.2;
}

const LABEL_OFFSET = new Cartesian3(0, -20, 0) as unknown as import('cesium').Cartesian2;
const LABEL_OFFSET_SM = new Cartesian3(0, -18, 0) as unknown as import('cesium').Cartesian2;

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
    // Static geo layers
    this.registerLayer('nuclear', () => this.loadNuclearFacilities());
    this.registerLayer('cables', () => this.loadUnderseaCables());
    this.registerLayer('bases', () => this.loadMilitaryBases());
    this.registerLayer('waterways', () => this.loadStrategicWaterways());
    this.registerLayer('spaceports', () => this.loadSpaceports());
    this.registerLayer('minerals', () => this.loadCriticalMinerals());
    this.registerLayer('hotspots', () => this.loadIntelHotspots());

    // Dynamic data layers
    this.registerLayer('earthquakes', () => this.loadEarthquakes());
    this.registerLayer('gdacs', () => this.loadGDACS());
    this.registerLayer('volcanoes', () => this.loadVolcanoes());
    this.registerLayer('cyclones', () => this.loadTropicalCyclones());
    this.registerLayer('fires', () => this.loadFires());
    this.registerLayer('conflicts', () => this.loadConflicts());
    this.registerLayer('airstrikes', () => this.loadAirstrikes());
    this.registerLayer('cyber', () => this.loadCyberThreats());
    this.registerLayer('flights', () => this.loadMilitaryFlights());
    this.registerLayer('vessels', () => this.loadMilitaryVessels());
    this.registerLayer('darkVessels', () => this.loadDarkVessels());
    this.registerLayer('gpsJamming', () => this.loadGpsJamming());
    this.registerLayer('satChange', () => this.loadSatelliteChange());
    this.registerLayer('protests', () => this.loadProtests());
    this.registerLayer('disease', () => this.loadDiseaseOutbreaks());
    this.registerLayer('displacement', () => this.loadDisplacement());

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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STATIC GEO LAYERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private loadNuclearFacilities(): void {
    const layer = this.layers.get('nuclear');
    if (!layer) return;

    for (const f of NUCLEAR_FACILITIES) {
      const isWeapons = f.type === 'weapons' || f.type === 'icbm' ||
        f.type === 'ssbn' || f.type === 'test-site';
      const color = isWeapons ? C.nuclearWeapons : C.nuclear;

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(f.lon, f.lat),
        billboard: {
          image: ICON_NUCLEAR,
          color,
          scale: isWeapons ? 0.4 : 0.3,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.4),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
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
          width: cable.major ? 2.5 : 1.5,
          material: new PolylineDashMaterialProperty({
            color: cable.major ? C.cableMajor : C.cable,
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
            billboard: {
              image: ICON_CABLE_LANDING,
              color: C.cableLanding,
              scale: 0.2,
              heightReference: HeightReference.CLAMP_TO_GROUND,
              verticalOrigin: VerticalOrigin.CENTER,
              horizontalOrigin: HorizontalOrigin.CENTER,
            },
          });
        }
      }
    }
  }

  private loadMilitaryBases(): void {
    const layer = this.layers.get('bases');
    if (!layer) return;

    for (const base of MILITARY_BASES) {
      const arm = base.arm?.toLowerCase() ?? '';
      const isNaval = arm.includes('navy') || arm.includes('naval');
      const isAir = arm.includes('air');
      let icon = ICON_BASE;
      if (isNaval) icon = ICON_BASE_NAVAL;
      else if (isAir) icon = ICON_BASE_AIR;
      const color = baseColor(base.type);

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(base.lon, base.lat),
        billboard: {
          image: icon,
          color,
          scale: 0.3,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.3),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: {
          text: base.name,
          font: '10px monospace',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 3e6),
        },
        description: `${base.name} — ${base.type}${base.arm ? ' (' + base.arm + ')' : ''}${base.country ? ' — ' + base.country : ''}`,
      });
    }
  }

  private loadStrategicWaterways(): void {
    const layer = this.layers.get('waterways');
    if (!layer) return;

    for (const ww of STRATEGIC_WATERWAYS) {
      layer.source.entities.add({
        position: Cartesian3.fromDegrees(ww.lon, ww.lat),
        billboard: {
          image: ICON_CHOKEPOINT,
          color: C.chokepoint,
          scale: 0.4,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.5),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: {
          text: ww.name,
          font: '11px monospace',
          fillColor: C.chokepoint,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e5, 1, 1e7, 0.3),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 8e6),
        },
        description: ww.description ?? ww.name,
      });
    }
  }

  private loadSpaceports(): void {
    const layer = this.layers.get('spaceports');
    if (!layer) return;

    for (const sp of SPACEPORTS) {
      layer.source.entities.add({
        position: Cartesian3.fromDegrees(sp.lon, sp.lat),
        billboard: {
          image: ICON_SPACEPORT,
          color: C.spaceport,
          scale: 0.35,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.4),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: {
          text: sp.name,
          font: '10px monospace',
          fillColor: C.spaceport,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 5e6),
        },
        description: `${sp.name} — ${sp.operator} (${sp.country}) — ${sp.status}`,
      });
    }
  }

  private loadCriticalMinerals(): void {
    const layer = this.layers.get('minerals');
    if (!layer) return;

    for (const m of CRITICAL_MINERALS) {
      layer.source.entities.add({
        position: Cartesian3.fromDegrees(m.lon, m.lat),
        billboard: {
          image: ICON_MINERAL,
          color: C.mineral,
          scale: 0.25,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.2, 1e7, 0.25),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: {
          text: m.mineral,
          font: '9px monospace',
          fillColor: C.mineral,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET_SM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 3e6),
        },
        description: `${m.name} — ${m.mineral} (${m.country}) — ${m.status}\n${m.significance}`,
      });
    }
  }

  private loadIntelHotspots(): void {
    const layer = this.layers.get('hotspots');
    if (!layer) return;

    for (const h of INTEL_HOTSPOTS) {
      const color = hotspotColor(h.level);
      const scale = hotspotScale(h.level);

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(h.lon, h.lat),
        billboard: {
          image: ICON_HOTSPOT,
          color,
          scale,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e5, 1.5, 1e7, 0.5),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: {
          text: h.name,
          font: '11px monospace',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e5, 1, 1e7, 0.2),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 1e7),
        },
        description: h.description ?? h.name,
      });
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DYNAMIC DATA LAYERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
      const color = isMajor ? C.earthquake : C.earthquakeMinor;
      const scale = Math.max(0.25, eq.magnitude * 0.08);

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(lon, lat),
        billboard: {
          image: ICON_EARTHQUAKE,
          color,
          scale,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.4),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: isMajor ? {
          text: `M${eq.magnitude.toFixed(1)}`,
          font: '11px monospace',
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
      const color = isRed ? C.gdacsRed : C.gdacs;
      const [lon, lat] = ev.coordinates;
      const icon = GDACS_ICONS[ev.eventType] ?? ICON_EARTHQUAKE;

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(lon, lat),
        billboard: {
          image: icon,
          color,
          scale: isRed ? 0.5 : 0.35,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.5),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
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

  private async loadVolcanoes(): Promise<void> {
    const layer = this.layers.get('volcanoes');
    if (!layer) return;

    const { fetchVolcanoAlerts } = await import('@/services/volcano-alerts');
    const volcanoes = await fetchVolcanoAlerts();

    for (const v of volcanoes) {
      const color = volcanoColor(v.alertLevel);
      const scale = volcanoScale(v.alertLevel);

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(v.lon, v.lat),
        billboard: {
          image: ICON_VOLCANO,
          color,
          scale,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.5),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: {
          text: `${v.name} [${v.alertLevel}]`,
          font: '10px monospace',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 6e6),
        },
        description: `${v.name} — ${v.alertLevel} / Aviation ${v.color} (${v.observatory})`,
      });
    }
  }

  private async loadTropicalCyclones(): Promise<void> {
    const layer = this.layers.get('cyclones');
    if (!layer) return;

    const { fetchTropicalCyclones } = await import('@/services/tropical-cyclones');
    const cyclones = await fetchTropicalCyclones();

    for (const tc of cyclones) {
      const isCat3Plus = tc.category === 'category_3' || tc.category === 'category_4' || tc.category === 'category_5';
      const isCat1Plus = isCat3Plus || tc.category === 'category_1' || tc.category === 'category_2';
      const color = cycloneColor(tc.category, isCat3Plus, isCat1Plus);
      const scale = cycloneScale(tc.category === 'category_5', isCat3Plus, isCat1Plus);

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(tc.lon, tc.lat),
        billboard: {
          image: ICON_CYCLONE,
          color,
          scale,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e5, 1.5, 1e7, 0.6),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: {
          text: `${tc.name}${tc.windKts ? ' ' + String(tc.windKts) + 'kt' : ''}`,
          font: '11px monospace',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e5, 1, 1e7, 0.3),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 1.5e7),
        },
        description: `${tc.name} — ${tc.category.replace('_', ' ')} (${tc.basin})\n${tc.movement}\n${tc.headline}`,
      });
    }
  }

  private async loadFires(): Promise<void> {
    const layer = this.layers.get('fires');
    if (!layer) return;

    const { fetchAllFires, flattenFires } = await import('@/services/wildfires');
    const result = await fetchAllFires();
    const fires = flattenFires(result.regions);

    for (const f of fires) {
      const lat = f.location?.latitude;
      const lon = f.location?.longitude;
      if (lat == null || lon == null) continue;

      const color = fireColor(f.confidence ?? '');
      const scale = fireScale(f.confidence ?? '');

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(lon, lat),
        billboard: {
          image: ICON_FIRE,
          color,
          scale,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.2),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        description: `Fire — FRP: ${f.frp.toFixed(1)} MW | Brightness: ${f.brightness.toFixed(0)} | ${f.region}`,
      });
    }
  }

  private async loadConflicts(): Promise<void> {
    const layer = this.layers.get('conflicts');
    if (!layer) return;

    const { fetchConflictEvents } = await import('@/services/conflict');
    const data = await fetchConflictEvents();

    for (const ev of data.events) {
      const isExplosion = ev.eventType === 'explosion' || ev.eventType === 'remote_violence';
      const icon = isExplosion ? ICON_EXPLOSION : ICON_CROSSHAIR;
      const color = isExplosion ? C.conflictExplosion : C.conflict;
      const scale = Math.min(0.5, 0.25 + ev.fatalities * 0.02);

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(ev.lon, ev.lat),
        billboard: {
          image: icon,
          color,
          scale,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.4, 1e7, 0.3),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: ev.fatalities > 0 ? {
          text: `${ev.fatalities} killed`,
          font: '10px monospace',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET_SM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 4e6),
        } : undefined,
        description: `${ev.eventType} — ${ev.location}, ${ev.country}`,
      });
    }
  }

  private async loadAirstrikes(): Promise<void> {
    const layer = this.layers.get('airstrikes');
    if (!layer) return;

    const { fetchAirstrikes } = await import('@/services/airstrikes');
    const strikes = await fetchAirstrikes();

    for (const s of strikes) {
      const scale = Math.min(0.5, 0.3 + s.fatalities * 0.02);

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(s.lon, s.lat),
        billboard: {
          image: ICON_AIRSTRIKE,
          color: C.airstrike,
          scale,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.4, 1e7, 0.3),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: {
          text: `${s.actor}`,
          font: '10px monospace',
          fillColor: C.airstrike,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET_SM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 4e6),
        },
        description: `Airstrike — ${s.actor} vs ${s.targetActor}\n${s.location}, ${s.country}\n${s.fatalities} fatalities\n${s.notes}`,
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

      const isCritical = t.severity === 'critical';
      const icon = isCritical ? ICON_CYBER_CRITICAL : ICON_CYBER;
      const color = cyberColor(t.severity);

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(t.lon, t.lat),
        billboard: {
          image: icon,
          color,
          scale: isCritical ? 0.35 : 0.25,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.2, 1e7, 0.2),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        description: `${t.type} — ${t.indicator} (${t.severity})`,
      });
    }
  }

  private async loadMilitaryFlights(): Promise<void> {
    const layer = this.layers.get('flights');
    if (!layer) return;

    const { fetchMilitaryFlights } = await import('@/services/military-flights');
    const { flights } = await fetchMilitaryFlights();

    for (const f of flights) {
      const icon = AIRCRAFT_ICONS[f.aircraftType] ?? ICON_TRANSPORT;
      const altMeters = f.altitude * 0.3048;

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(f.lon, f.lat, altMeters),
        billboard: {
          image: icon,
          color: C.flight,
          scale: 0.4,
          rotation: CesiumMath.toRadians(-f.heading),
          alignedAxis: Cartesian3.UNIT_Z,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.5),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: {
          text: f.callsign ?? f.hexCode,
          font: '10px monospace',
          fillColor: C.flight,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET_SM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 3e6),
        },
        description: `${f.callsign || 'Unknown'} — ${f.aircraftModel ?? f.aircraftType} (${f.operatorCountry})` +
          `\nAlt: ${Math.round(f.altitude).toLocaleString()} ft | Speed: ${Math.round(f.speed)} kts | Hdg: ${Math.round(f.heading)}°`,
      });

      if (f.track && f.track.length >= 2) {
        const trailPositions = f.track.map(([lon, lat]: [number, number]) =>
          Cartesian3.fromDegrees(lon, lat, altMeters),
        );
        layer.source.entities.add({
          polyline: {
            positions: trailPositions,
            width: 1.5,
            material: new ColorMaterialProperty(C.flightTrail),
          },
        });
      }
    }
  }

  private async loadMilitaryVessels(): Promise<void> {
    const layer = this.layers.get('vessels');
    if (!layer) return;

    const { fetchMilitaryVessels } = await import('@/services/military-vessels');
    const { vessels } = await fetchMilitaryVessels();

    for (const v of vessels) {
      this.addVesselEntity(layer.source, v);
    }
  }

  private addVesselEntity(
    source: CustomDataSource,
    v: { lon: number; lat: number; heading: number; speed: number; name: string; mmsi: string; vesselType: string; isDark?: boolean; nearChokepoint?: string; track?: [number, number][] },
  ): void {
    const isDark = v.isDark ?? false;
    const color = isDark ? C.vesselDark : C.vessel;
    const icon = VESSEL_ICONS[v.vesselType] ?? ICON_WARSHIP;
    const isLarge = v.vesselType === 'carrier' || v.vesselType === 'amphibious';

    source.entities.add({
      position: Cartesian3.fromDegrees(v.lon, v.lat),
      billboard: {
        image: icon,
        color,
        scale: isLarge ? 0.45 : 0.35,
        rotation: CesiumMath.toRadians(-v.heading),
        alignedAxis: Cartesian3.UNIT_Z,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.5),
        verticalOrigin: VerticalOrigin.CENTER,
        horizontalOrigin: HorizontalOrigin.CENTER,
      },
      label: {
        text: v.name ?? v.mmsi,
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
      description: `${v.name ?? v.mmsi} — ${v.vesselType}${isDark ? ' (DARK SHIP)' : ''}` +
        `\nSpeed: ${Math.round(v.speed)} kts | Hdg: ${Math.round(v.heading)}°` +
        (v.nearChokepoint ? `\nNear: ${v.nearChokepoint}` : ''),
    });

    if (v.track && v.track.length >= 2) {
      const trailPositions = v.track.map(([lon, lat]: [number, number]) =>
        Cartesian3.fromDegrees(lon, lat),
      );
      source.entities.add({
        polyline: {
          positions: trailPositions,
          width: 1.5,
          material: new ColorMaterialProperty(isDark ? C.vesselDarkTrail : C.vesselTrail),
          clampToGround: true,
        },
      });
    }
  }

  private async loadDarkVessels(): Promise<void> {
    const layer = this.layers.get('darkVessels');
    if (!layer) return;

    const { detectDarkVessels } = await import('@/services/dark-vessel');
    const alerts = detectDarkVessels();

    for (const dv of alerts) {
      const isCritical = dv.severity === 'critical' || dv.severity === 'high';
      const color = isCritical ? C.darkVesselCritical : C.darkVessel;

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(dv.lastLon, dv.lastLat),
        billboard: {
          image: ICON_DARK_VESSEL,
          color,
          scale: isCritical ? 0.4 : 0.3,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.5),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: {
          text: `${dv.vesselName || dv.mmsi} DARK ${Math.round(dv.darkHours)}h`,
          font: '10px monospace',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET_SM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 5e6),
        },
        description: `DARK VESSEL — ${dv.vesselName || dv.mmsi} (${dv.flag})` +
          `\nAIS off for ${Math.round(dv.darkHours)} hours` +
          `\nRisk zone: ${dv.riskZone}` +
          (dv.sanctioned ? '\nSANCTIONED' : ''),
      });
    }
  }

  private async loadGpsJamming(): Promise<void> {
    const layer = this.layers.get('gpsJamming');
    if (!layer) return;

    const { fetchGpsInterference } = await import('@/services/gps-interference');
    const data = await fetchGpsInterference();
    if (!data) return;

    for (const hex of data.hexes) {
      const color = hex.level === 'high' ? C.gpsHigh : C.gpsMedium;

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(hex.lon, hex.lat),
        billboard: {
          image: ICON_GPS_JAM,
          color,
          scale: hex.level === 'high' ? 0.4 : 0.3,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.4),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: hex.level === 'high' ? {
          text: `GPS JAM ${Math.round(hex.pct)}%`,
          font: '10px monospace',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET_SM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 5e6),
        } : undefined,
        description: `GPS Interference — ${hex.pct.toFixed(1)}% affected\n${hex.bad}/${hex.total} reports degraded`,
      });
    }
  }

  private async loadSatelliteChange(): Promise<void> {
    const layer = this.layers.get('satChange');
    if (!layer) return;

    const { getRecentDetections, getWatchLocations } = await import('@/services/satellite-change');

    // Show watched locations as rings
    const locations = getWatchLocations();
    for (const loc of locations) {
      if (!loc.enabled) continue;
      layer.source.entities.add({
        position: Cartesian3.fromDegrees(loc.lon, loc.lat),
        billboard: {
          image: ICON_SAT_CHANGE,
          color: C.satChangeLow,
          scale: 0.3,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.2, 1e7, 0.3),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: {
          text: loc.name,
          font: '10px monospace',
          fillColor: C.satChangeLow,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET_SM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 5e6),
        },
        description: `Watch zone: ${loc.name} (${loc.radiusKm}km radius)`,
      });
    }

    // Show recent detections
    const detections = getRecentDetections(72);
    for (const d of detections) {
      const color = satChangeColor(d.severity);

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(d.lon, d.lat),
        billboard: {
          image: ICON_SAT_CHANGE,
          color,
          scale: 0.35,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 1e7, 0.4),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        description: `${d.changeType} at ${d.locationName}\n${d.description}\nConfidence: ${d.confidence}% | Area: ${d.areaSqKm.toFixed(1)} km²`,
      });
    }
  }

  private async loadProtests(): Promise<void> {
    const layer = this.layers.get('protests');
    if (!layer) return;

    const { fetchProtestEvents } = await import('@/services/unrest');
    const data = await fetchProtestEvents();

    for (const ev of data.events) {
      const isHigh = ev.severity === 'high';
      const color = isHigh ? C.protestHigh : C.protest;

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(ev.lon, ev.lat),
        billboard: {
          image: ICON_PROTEST,
          color,
          scale: isHigh ? 0.35 : 0.25,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e4, 1.2, 1e7, 0.25),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: isHigh ? {
          text: ev.title,
          font: '10px monospace',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET_SM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e4, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 4e6),
        } : undefined,
        description: `${ev.title} — ${ev.eventType} (${ev.country})`,
      });
    }
  }

  private async loadDiseaseOutbreaks(): Promise<void> {
    const layer = this.layers.get('disease');
    if (!layer) return;

    const { fetchDiseaseIntel } = await import('@/services/disease-intel');
    const data = await fetchDiseaseIntel();

    for (const c of data.covidCountries) {
      if (!c.lat || !c.lon) continue;
      const color = diseaseColor(c.casesPerOneMillion);
      const scale = diseaseScale(c.casesPerOneMillion);
      const showLabel = c.casesPerOneMillion > 1000;

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(c.lon, c.lat),
        billboard: {
          image: ICON_DISEASE,
          color,
          scale,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e5, 1.5, 1e7, 0.4),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: showLabel ? {
          text: `${c.country} ${c.todayCases > 0 ? '+' + c.todayCases.toLocaleString() : ''}`,
          font: '10px monospace',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET_SM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e5, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 1e7),
        } : undefined,
        description: `${c.country} — Active: ${c.active.toLocaleString()} | Today: +${c.todayCases.toLocaleString()} | Per 1M: ${Math.round(c.casesPerOneMillion).toLocaleString()}`,
      });
    }
  }

  private async loadDisplacement(): Promise<void> {
    const layer = this.layers.get('displacement');
    if (!layer) return;

    const { fetchUnhcrPopulation } = await import('@/services/displacement');
    const result = await fetchUnhcrPopulation();
    if (!result.ok) return;

    // Country markers for displacement origin countries
    for (const country of result.data.countries) {
      if (!country.lat || !country.lon || country.totalDisplaced < 10_000) continue;
      const isHigh = country.totalDisplaced > 1_000_000;
      const color = isHigh ? C.displacementHigh : C.displacement;
      const scale = Math.min(0.5, 0.2 + Math.log10(country.totalDisplaced) * 0.04);

      layer.source.entities.add({
        position: Cartesian3.fromDegrees(country.lon, country.lat),
        billboard: {
          image: ICON_DISPLACEMENT,
          color,
          scale,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new NearFarScalar(1e5, 1.5, 1e7, 0.4),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
        label: isHigh ? {
          text: `${country.name} ${(country.totalDisplaced / 1e6).toFixed(1)}M`,
          font: '10px monospace',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: LABEL_OFFSET_SM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scaleByDistance: new NearFarScalar(1e5, 1, 1e7, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 1.5e7),
        } : undefined,
        description: `${country.name} — ${country.totalDisplaced.toLocaleString()} displaced` +
          `\nRefugees: ${country.refugees.toLocaleString()} | IDPs: ${country.idps.toLocaleString()}`,
      });
    }

    // Arc lines for top refugee flows
    for (const flow of result.data.topFlows.slice(0, 30)) {
      if (!flow.originLat || !flow.originLon || !flow.asylumLat || !flow.asylumLon) continue;
      if (flow.refugees < 50_000) continue;

      layer.source.entities.add({
        polyline: {
          positions: [
            Cartesian3.fromDegrees(flow.originLon, flow.originLat, 50_000),
            Cartesian3.fromDegrees(
              (flow.originLon + flow.asylumLon) / 2,
              (flow.originLat + flow.asylumLat) / 2,
              200_000,
            ),
            Cartesian3.fromDegrees(flow.asylumLon, flow.asylumLat, 50_000),
          ],
          width: Math.min(4, 1 + Math.log10(flow.refugees) * 0.3),
          material: new ColorMaterialProperty(C.displacementFlow),
        },
        description: `${flow.originName} → ${flow.asylumName}: ${flow.refugees.toLocaleString()} refugees`,
      });
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PUBLIC API
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  setLayerVisible(name: string, visible: boolean): void {
    const layer = this.layers.get(name);
    if (layer) layer.source.show = visible;
  }

  getEntityCount(): number {
    let count = 0;
    for (const [, layer] of this.layers) {
      if (layer.source.show) count += layer.source.entities.values.length;
    }
    return count;
  }

  getLayerCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const [name, layer] of this.layers) {
      counts.set(name, layer.source.entities.values.length);
    }
    return counts;
  }

  destroy(): void {
    for (const [, layer] of this.layers) {
      this.viewer.dataSources.remove(layer.source, true);
    }
    this.layers.clear();
  }
}
