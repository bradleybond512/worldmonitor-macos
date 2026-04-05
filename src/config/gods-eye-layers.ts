export interface GodsEyeLayerConfig {
  name: string;
  category: 'spatial' | 'intelligence' | 'aesthetic' | 'analytical';
  enabled: boolean;
  description: string;
}

export type GodsEyeLayers = Record<string, GodsEyeLayerConfig>;

export const DEFAULT_GODS_EYE_LAYERS: GodsEyeLayers = {
  satellites: {
    name: 'Satellite Tracking',
    category: 'spatial',
    enabled: false,
    description: 'Real-time satellite positions and orbital paths',
  },
  terrain: {
    name: '3D Terrain',
    category: 'spatial',
    enabled: false,
    description: 'Cesium World Terrain with elevation',
  },
  buildings: {
    name: '3D Buildings',
    category: 'spatial',
    enabled: false,
    description: 'Google Photorealistic 3D Tiles / OSM Buildings',
  },
  imagery: {
    name: 'Satellite Imagery',
    category: 'spatial',
    enabled: false,
    description: 'Sentinel-2, Landsat, MODIS overlays',
  },
  hud: {
    name: 'HUD Overlay',
    category: 'aesthetic',
    enabled: false,
    description: 'Threat brackets, status readouts, compass',
  },
  entityGraph: {
    name: 'Entity Graph',
    category: 'analytical',
    enabled: false,
    description: '3D force-directed entity link analysis',
  },
  rfCoverage: {
    name: 'RF/SIGINT',
    category: 'intelligence',
    enabled: false,
    description: 'GPS jamming domes, radar cones, EW hotspots',
  },
  timeline: {
    name: 'Timeline',
    category: 'analytical',
    enabled: false,
    description: 'Temporal playback with event scrubbing',
  },
  atmosphere: {
    name: 'Atmosphere Glow',
    category: 'aesthetic',
    enabled: false,
    description: 'Atmospheric scatter shader on globe edge',
  },
  scanlines: {
    name: 'Scanlines',
    category: 'aesthetic',
    enabled: false,
    description: 'Subtle CRT/tactical display effect',
  },
  bloom: {
    name: 'Bloom',
    category: 'aesthetic',
    enabled: false,
    description: 'Glow effect on bright elements',
  },
};

const STORAGE_KEY = 'worldmonitor-gods-eye-layers';

export function loadGodsEyeLayers(): GodsEyeLayers {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return structuredClone(DEFAULT_GODS_EYE_LAYERS);
    const parsed = JSON.parse(stored) as Record<string, boolean>;
    const layers = structuredClone(DEFAULT_GODS_EYE_LAYERS);
    for (const [key, enabled] of Object.entries(parsed)) {
      if (key in layers) {
        layers[key]!.enabled = enabled;
      }
    }
    return layers;
  } catch {
    return structuredClone(DEFAULT_GODS_EYE_LAYERS);
  }
}

export function saveGodsEyeLayers(layers: GodsEyeLayers): void {
  const simplified: Record<string, boolean> = {};
  for (const [key, config] of Object.entries(layers)) {
    simplified[key] = config.enabled;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(simplified));
}
