import {
  Viewer,
  IonImageryProvider,
  OpenStreetMapImageryProvider,
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
      baseLayer: false,
      terrain: undefined,
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
        webgl: {
          alpha: true,
          antialias: false,
          powerPreference: 'default',
        },
      },
      msaaSamples: 1,
      useBrowserRecommendedResolution: true,
    });

    // Dark background for God's Eye aesthetic
    this.viewer.scene.backgroundColor = Color.fromCssColorString('#0a0a0f');
    this.viewer.scene.globe.baseColor = Color.fromCssColorString('#0d1b2a');

    // Reduce shader complexity — avoid WebKit ANGLE/Metal crashes
    this.viewer.scene.globe.enableLighting = false;
    this.viewer.scene.globe.showGroundAtmosphere = false;
    this.viewer.scene.fog.enabled = false;
    this.viewer.scene.highDynamicRange = false;
    this.viewer.scene.postProcessStages.fxaa.enabled = false;
    if (this.viewer.scene.sun) this.viewer.scene.sun.show = false;
    if (this.viewer.scene.moon) this.viewer.scene.moon.show = false;

    // Explicitly enable camera controls — WKWebView can be finicky
    const controller = this.viewer.scene.screenSpaceCameraController;
    controller.enableZoom = true;
    controller.enableRotate = true;
    controller.enableTilt = true;
    controller.enableLook = true;

    // Add imagery AFTER viewer init — avoids passing Promise to baseLayer
    this.viewer.imageryLayers.removeAll();
    if (this.options.ionToken) {
      try {
        const darkImagery = await IonImageryProvider.fromAssetId(3845, {});
        this.viewer.imageryLayers.addImageryProvider(darkImagery);
      } catch {
        // Ion token may lack access to dark imagery — fall back to OSM
        const osmImagery = new OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/',
        });
        this.viewer.imageryLayers.addImageryProvider(osmImagery);
      }
    } else {
      const osmImagery = new OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      });
      this.viewer.imageryLayers.addImageryProvider(osmImagery);
    }

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

  get canvas(): HTMLCanvasElement | undefined {
    return this.viewer?.canvas;
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
