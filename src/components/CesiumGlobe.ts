import {
  Viewer,
  IonImageryProvider,
  OpenStreetMapImageryProvider,
  Terrain,
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

    const hasToken = Boolean(this.options.ionToken);

    this.viewer = new Viewer(cesiumContainer, {
      sceneMode: SceneMode.SCENE3D,
      animation: false,
      baseLayerPicker: false,
      baseLayer: false,
      terrain: hasToken ? Terrain.fromWorldTerrain() : undefined,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      shadows: false,
      contextOptions: {
        webgl: {
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        },
      },
      msaaSamples: 4,
      useBrowserRecommendedResolution: false,
    });

    const scene = this.viewer.scene;
    const globe = scene.globe;

    // ── Resolution ──────────────────────────────────────
    // Render at native retina resolution for sharp imagery
    this.viewer.resolutionScale = Math.min(window.devicePixelRatio, 2);

    // ── Sky & Space ────────────────────────────────────
    scene.backgroundColor = Color.fromCssColorString('#050510');
    globe.baseColor = Color.fromCssColorString('#0d1b2a');

    // Sun and moon — visible light sources give depth
    if (scene.sun) scene.sun.show = true;
    if (scene.moon) scene.moon.show = true;

    // ── Globe Lighting ─────────────────────────────────
    // Disable day/night cycle — keeps globe evenly lit and sharp
    globe.enableLighting = false;
    globe.showGroundAtmosphere = true;

    // Sky atmosphere — the blue glow around Earth's edge
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.show = true;
      // Cool blue-shifted atmosphere for cinematic look
      scene.skyAtmosphere.hueShift = -0.05;
      scene.skyAtmosphere.saturationShift = 0.15;
      scene.skyAtmosphere.brightnessShift = -0.05;
    }

    // ── Terrain ────────────────────────────────────────
    // Exaggerate elevation so mountains are dramatic when zoomed out
    scene.verticalExaggeration = 1.5;
    scene.verticalExaggerationRelativeHeight = 0;

    // ── Fog & Depth ────────────────────────────────────
    // Atmospheric fog fades distant terrain into haze
    scene.fog.enabled = true;
    scene.fog.density = 2e-4;
    scene.fog.minimumBrightness = 0.03;

    // ── Post-Processing ────────────────────────────────
    // FXAA anti-aliasing
    scene.postProcessStages.fxaa.enabled = true;

    // Bloom — disabled for clarity; enable per-layer if needed
    scene.postProcessStages.bloom.enabled = false;

    // Ambient occlusion — disabled; darkens terrain too much at globe scale
    scene.postProcessStages.ambientOcclusion.enabled = false;

    // HDR for richer lighting range
    scene.highDynamicRange = true;

    // ── Camera Controls ────────────────────────────────
    const controller = scene.screenSpaceCameraController;
    controller.enableZoom = true;
    controller.enableRotate = true;
    controller.enableTilt = true;
    controller.enableLook = true;
    // Allow deeper tilt for dramatic oblique views
    controller.minimumZoomDistance = 250;
    controller.maximumZoomDistance = 5e7;

    // ── Imagery Layers ─────────────────────────────────
    this.viewer.imageryLayers.removeAll();

    if (hasToken) {
      try {
        // Day imagery: Bing Maps Aerial (asset 2) — high-res satellite
        // Fades to 30% on night side so terrain stays visible
        const bingImagery = await IonImageryProvider.fromAssetId(2, {});
        const dayLayer = this.viewer.imageryLayers.addImageryProvider(bingImagery);
        dayLayer.alpha = 1;
        dayLayer.brightness = 1.1;
        dayLayer.contrast = 1.15;
        dayLayer.saturation = 1.2;
      } catch {
        this.addFallbackImagery();
      }
    } else {
      this.addFallbackImagery();
    }

    // ── Resize Observer ────────────────────────────────
    this.resizeObserver = new ResizeObserver(() => {
      this.viewer?.resize();
    });
    this.resizeObserver.observe(this.container);
  }

  private addFallbackImagery(): void {
    if (!this.viewer) return;
    const osmImagery = new OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
    });
    const layer = this.viewer.imageryLayers.addImageryProvider(osmImagery);
    layer.alpha = 1;
    layer.brightness = 1.1;
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
