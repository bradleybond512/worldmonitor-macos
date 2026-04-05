import {
  Viewer,
  IonImageryProvider,
  SceneMode,
  Color,
  type Scene,
  type Camera,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { initCesium } from '@/config/cesium-init';

export interface CesiumGlobeOptions {
  container: HTMLElement;
  ionToken?: string;
}

export class CesiumGlobe {
  private viewer: Viewer | null = null;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private readonly options: CesiumGlobeOptions) {
    this.container = options.container;
  }

  async initialize(): Promise<void> {
    initCesium(this.options.ionToken);

    const cesiumContainer = document.createElement('div');
    cesiumContainer.style.cssText = 'width:100%;height:100%;position:absolute;inset:0;';
    this.container.append(cesiumContainer);

    this.viewer = new Viewer(cesiumContainer, {
      sceneMode: SceneMode.SCENE3D,
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      shadows: false,
      skyBox: false,
      skyAtmosphere: false,
      contextOptions: {
        webgl: { alpha: true },
      },
    });

    // Dark background
    this.viewer.scene.backgroundColor = Color.fromCssColorString('#0a0a0f');
    this.viewer.scene.globe.baseColor = Color.fromCssColorString('#0d1b2a');

    // Remove default imagery and add dark-styled layer
    this.viewer.imageryLayers.removeAll();
    const darkImagery = await IonImageryProvider.fromAssetId(3845, {});
    this.viewer.imageryLayers.addImageryProvider(darkImagery);

    // Globe settings
    this.viewer.scene.globe.enableLighting = false;
    this.viewer.scene.globe.showGroundAtmosphere = false;
    this.viewer.scene.fog.enabled = false;
    this.viewer.scene.screenSpaceCameraController.enableTilt = true;
    this.viewer.scene.screenSpaceCameraController.enableLook = true;

    // Handle resize
    this.resizeObserver = new ResizeObserver(() => {
      this.viewer?.resize();
    });
    this.resizeObserver.observe(this.container);
  }

  get scene(): Scene | undefined {
    return this.viewer?.scene;
  }

  get camera(): Camera | undefined {
    return this.viewer?.camera;
  }

  get cesiumViewer(): Viewer | undefined {
    return this.viewer ?? undefined;
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.destroy();
    }
    this.viewer = null;
  }
}
