/**
 * 3D Building Tiles — 5-tier redundant fallback chain
 *
 * Tier 1: Google Photorealistic 3D Tiles (requires GOOGLE_MAPS_API_KEY)
 * Tier 2: Cesium OSM Buildings, Ion asset 96188 (requires CESIUM_ION_TOKEN)
 * Tier 3: Esri I3S global building scene layer (free, no key)
 * Tier 4: No 3D buildings on globe
 * Tier 5: Flat rendering (current state)
 */

import {
  Cesium3DTileset,
  type Viewer,
} from 'cesium';
import { getRuntimeConfigSnapshot } from '@/services/runtime-config';

export type BuildingTier = 1 | 2 | 3 | 4 | 5;

export interface BuildingTileState {
  currentTier: BuildingTier;
  providerName: string;
  tileset: Cesium3DTileset | null;
}

const TIER_NAMES: Record<BuildingTier, string> = {
  1: 'Google Photorealistic 3D Tiles',
  2: 'Cesium OSM Buildings',
  3: 'Esri I3S Buildings',
  4: 'No 3D Buildings',
  5: 'Flat Rendering',
};

export class BuildingTileManager {
  private viewer: Viewer;
  private tileset: Cesium3DTileset | null = null;
  private _currentTier: BuildingTier = 5;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  get currentTier(): BuildingTier {
    return this._currentTier;
  }

  get providerName(): string {
    return TIER_NAMES[this._currentTier];
  }

  async initialize(): Promise<void> {
    // Tier 1: Google Photorealistic 3D Tiles
    const googleKey = getRuntimeConfigSnapshot().secrets.GOOGLE_MAPS_API_KEY?.value;
    if (googleKey) {
      try {
        this.tileset = await Cesium3DTileset.fromUrl(
          `https://tile.googleapis.com/v1/3dtiles/root.json?key=${googleKey}`
        );
        this.viewer.scene.primitives.add(this.tileset);
        this._currentTier = 1;
        return;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[BuildingTiles] Google 3D Tiles failed, trying Cesium OSM:', error);
      }
    }

    // Tier 2: Cesium OSM Buildings (Ion asset 96188)
    const ionToken = getRuntimeConfigSnapshot().secrets.CESIUM_ION_TOKEN?.value;
    if (ionToken) {
      try {
        this.tileset = await Cesium3DTileset.fromIonAssetId(96_188);
        this.viewer.scene.primitives.add(this.tileset);
        this._currentTier = 2;
        return;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[BuildingTiles] Cesium OSM Buildings failed, no 3D buildings available:', error);
      }
    }

    // Tier 4/5: No 3D buildings (Tier 3 I3SDataProvider not available in this Cesium version)
    this._currentTier = 4;
  }

  destroy(): void {
    if (this.tileset) {
      this.viewer.scene.primitives.remove(this.tileset);
      this.tileset = null;
    }
    this._currentTier = 5;
  }
}
